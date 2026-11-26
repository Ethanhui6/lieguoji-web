import Foundation

// MARK: - 高精度多档网格分辨率体系（v7.0：20K 标准 / 60K 高精 / 120K 史诗）

/// 地图拓扑分辨率档位：突破原版 20K 网格 / 480 州 / 24 国上限，向钢铁雄心4 / 历史时代3 级细粒度看齐。
public enum MapResolutionTier: String, Codable, CaseIterable, Sendable, Identifiable {
    case standard20K = "20k"
    case high60K     = "60k"
    case ultra120K   = "120k"

    public var id: String { rawValue }

    public var title: String {
        switch self {
        case .standard20K: return "标准精图 (20K)"
        case .high60K:     return "高精舆图 (60K)"
        case .ultra120K:   return "史诗超精图 (120K)"
        }
    }

    public var subtitle: String {
        switch self {
        case .standard20K: return "2 万多边形 · 至多 480 州 · 极速生成"
        case .high60K:     return "6 万多边形 · 至多 1,200 州 · 精细半岛与岸线"
        case .ultra120K:   return "12 万多边形 · 至多 2,400 州 · HOI4 级微观地形"
        }
    }

    public var expectedCells: Int {
        switch self {
        case .standard20K: return 19_928
        case .high60K:     return 59_984
        case .ultra120K:   return 120_120
        }
    }

    public var maxProvinces: Int {
        switch self {
        case .standard20K: return 480
        case .high60K:     return 1200
        case .ultra120K:   return 2400
        }
    }

    public var defaultHistoricalProvinces: Int {
        switch self {
        case .standard20K: return 155
        case .high60K:     return 340
        case .ultra120K:   return 560
        }
    }

    public var fileSuffix: String {
        switch self {
        case .standard20K: return "20k"
        case .high60K:     return "60k"
        case .ultra120K:   return "120k"
        }
    }
}

/// 统一的多分辨率网格目录与热更挂载器（纯 Foundation，iOS + Linux 服务器共用）。
public enum MeshCatalog {
    /// 检查某个高精分辨率档位是否已在 HotPack `HDMeshes/` 中完整就绪。
    public static func isAvailable(_ tier: MapResolutionTier, hotPackRoot: URL?) -> Bool {
        if tier == .standard20K { return true }
        guard let root = hotPackRoot else { return false }
        let dir = root.appendingPathComponent("HDMeshes", isDirectory: true)
            .appendingPathComponent(tier.fileSuffix, isDirectory: true)
        let fm = FileManager.default
        let s = tier.fileSuffix
        return fm.fileExists(atPath: dir.appendingPathComponent("grid\(s).bin").path)
            && fm.fileExists(atPath: dir.appendingPathComponent("doc\(s).bin").path)
            && fm.fileExists(atPath: dir.appendingPathComponent("edges\(s).bin").path)
            && fm.fileExists(atPath: dir.appendingPathComponent("world\(s).bin").path)
    }

    public static func availableTiers(hotPackRoot: URL?) -> [MapResolutionTier] {
        MapResolutionTier.allCases.filter { isAvailable($0, hotPackRoot: hotPackRoot) }
    }

    /// 加载指定分辨率档位的完整 `CreationMap.Inputs`（若高精网格未安装则无缝回落至内置 20K）。
    public static func loadInputs(
        tier: MapResolutionTier,
        hotPackRoot: URL?,
        bundleWorldURL: URL
    ) throws -> (inputs: CreationMap.Inputs, actualTier: MapResolutionTier) {
        if tier != .standard20K, let root = hotPackRoot, isAvailable(tier, hotPackRoot: root) {
            let dir = root.appendingPathComponent("HDMeshes", isDirectory: true)
                .appendingPathComponent(tier.fileSuffix, isDirectory: true)
            let s = tier.fileSuffix
            let metaData = try Data(contentsOf: bundleWorldURL.appendingPathComponent("world.json"))
            let meta = try JSONDecoder().decode(WorldMeta.self, from: metaData)
            let base = try WorldMap(binary: Data(contentsOf: dir.appendingPathComponent("world\(s).bin")), meta: meta)
            let grid = try TerrainGraph(data: Data(contentsOf: dir.appendingPathComponent("grid\(s).bin")))
            let doc = try TerrainDocument(data: Data(contentsOf: dir.appendingPathComponent("doc\(s).bin")))
            let edges = try CreationMap.GridEdges(data: Data(contentsOf: dir.appendingPathComponent("edges\(s).bin")))
            return (CreationMap.Inputs(base: base, grid: grid, edges: edges, document: doc), tier)
        }
        let base = try WorldMap.load(directory: bundleWorldURL)
        let grid = try TerrainGraph(data: Data(contentsOf: bundleWorldURL.appendingPathComponent("grid20k.bin")))
        let doc = try TerrainDocument(data: Data(contentsOf: bundleWorldURL.appendingPathComponent("doc20k.bin")))
        let edges = try CreationMap.GridEdges(data: Data(contentsOf: bundleWorldURL.appendingPathComponent("edges20k.bin")))
        return (CreationMap.Inputs(base: base, grid: grid, edges: edges, document: doc), .standard20K)
    }

    /// 加载指定分辨率档位的预览输入（用于地图工坊 3.0 与历史剧本缩略图）。
    public static func loadPreviewInputs(
        tier: MapResolutionTier,
        hotPackRoot: URL?,
        bundleWorldURL: URL
    ) throws -> (inputs: PreviewWorld.Inputs, actualTier: MapResolutionTier) {
        let loaded = try loadInputs(tier: tier, hotPackRoot: hotPackRoot, bundleWorldURL: bundleWorldURL)
        return (PreviewWorld.Inputs(base: loaded.inputs.base, grid: loaded.inputs.grid, document: loaded.inputs.document), loaded.actualTier)
    }
}

// MARK: - 五千年 45 纪元可玩历史剧本库（v7.0：挂载 HotPack `Eras45/eras45_v6.bin` 与索引）

/// 单个可玩历史纪元的国家规格（从 `eras45_index.json` 或二进制索引解析）。
public struct EraPolityEntry: Codable, Equatable, Sendable {
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
    public var rulerName: String
    public var rulerTitle: String

    public init(
        id: String, name: String, shortName: String, color: String,
        culture: String, religion: String, polity: String, style: String,
        capitalLon: Double, capitalLat: Double, capitalName: String,
        rulerName: String, rulerTitle: String
    ) {
        self.id = id; self.name = name; self.shortName = shortName; self.color = color
        self.culture = culture; self.religion = religion; self.polity = polity; self.style = style
        self.capitalLon = capitalLon; self.capitalLat = capitalLat; self.capitalName = capitalName
        self.rulerName = rulerName; self.rulerTitle = rulerTitle
    }
}

/// 单个可玩历史纪元元数据（覆盖公元前 3000 年至公元 2010 年全 45 个真实世界史时间切面）。
public struct PlayableHistoricalEra: Codable, Equatable, Sendable, Identifiable {
    public var id: String
    public var year: Int
    public var title: String
    public var subtitle: String
    public var eraLock: String
    public var nationCount: Int
    public var polities: [EraPolityEntry]

    public var yearDisplayText: String {
        year < 0 ? "公元前\(-year)年" : "公元\(year)年"
    }

    public init(
        id: String, year: Int, title: String, subtitle: String,
        eraLock: String, nationCount: Int, polities: [EraPolityEntry] = []
    ) {
        self.id = id; self.year = year; self.title = title; self.subtitle = subtitle
        self.eraLock = eraLock; self.nationCount = nationCount; self.polities = polities
    }
}

/// 45 纪元二进制疆界数据包（`LGE4` 魔数）与实时开局转换器。
public enum HistoricalErasCatalog {
    public struct EraMask: Sendable {
        public let eraId: String
        public let cellCount: Int
        public let nationCount: Int
        public let ownerMask: [Int8]
        public let popDensity: [UInt8]
    }

    private final class Store: @unchecked Sendable {
        private let lock = NSLock()
        private var eras: [PlayableHistoricalEra] = []
        private var masks: [String: EraMask] = [:] // key: "\(eraId)@\(cellCount)"

        func setEras(_ list: [PlayableHistoricalEra]) {
            lock.lock(); defer { lock.unlock() }
            eras = list
        }
        func allEras() -> [PlayableHistoricalEra] {
            lock.lock(); defer { lock.unlock() }
            return eras
        }
        func setMasks(_ map: [String: EraMask]) {
            lock.lock(); defer { lock.unlock() }
            for (k, v) in map { masks[k] = v }
        }
        func mask(eraId: String, cellCount: Int) -> EraMask? {
            lock.lock(); defer { lock.unlock() }
            return masks["\(eraId)@\(cellCount)"] ?? masks.values.first(where: { $0.eraId == eraId })
        }
        func maskCount() -> Int {
            lock.lock(); defer { lock.unlock() }
            return masks.count
        }
    }

    private static let store = Store()

    /// 内置 45 纪元完整年表目录（与 `world_*.geojson` 逐一严格对应，热更 `Eras45/` 挂载后即可一键以真实世界国界开局）。
    public static let builtInTimeline: [(id: String, year: Int, title: String, subtitle: String, era: String)] = [
        ("era_bc3000", -3000, "公元前3000年 · 早期青铜曙光", "古埃及第一王朝 · 苏美尔城邦 · 华夏龙山", "antiquity"),
        ("era_bc2000", -2000, "公元前2000年 · 禹夏与巴比伦", "夏朝初立 · 古埃及中王国 · 印度河文明", "antiquity"),
        ("era_bc1500", -1500, "公元前1500年 · 商汤与赫梯争霸", "大邑商 · 埃及新王国 · 巴比伦与亚述", "antiquity"),
        ("era_bc1000", -1000, "公元前1000年 · 西周分封与铁器", "周礼天下 · 亚述崛起 · 所罗门王国", "antiquity"),
        ("era_bc500",  -500,  "公元前500年 · 波希战争前夜", "阿契美尼德波斯 · 东周列国 · 希腊城邦 · 迦太基", "antiquity"),
        ("era_bc323",  -323,  "公元前323年 · 亚历山大帝国极盛", "马其顿横跨欧亚 · 战国七雄 · 孔雀兴起", "antiquity"),
        ("era_bc200",  -200,  "公元前200年 · 楚汉一统与罗马崛起", "西汉初立 · 冒顿匈奴 · 安息波斯 · 罗马共和", "antiquity"),
        ("era_bc100",  -100,  "公元前100年 · 汉武盛世与丝绸之路", "大汉通西域 · 罗马称霸地中海 · 安息波斯", "antiquity"),
        ("era_bc1",    -1,    "公元前1年 · 汉罗东西双雄", "奥古斯都元首制 · 西汉末年 · 亚美尼亚与安息", "antiquity"),
        ("era_ad100",  100,   "公元100年 · 图拉真与东汉盛世", "罗马黄金疆域 · 东汉班超定西域 · 贵霜帝国", "medieval"),
        ("era_ad200",  200,   "公元200年 · 官渡之战与塞维鲁", "汉末群雄割据 · 罗马塞维鲁王朝 · 帕提亚", "medieval"),
        ("era_ad300",  300,   "公元300年 · 西晋与戴克里先", "太康余晖 · 罗马四帝共治 · 萨珊波斯兴盛", "medieval"),
        ("era_ad400",  400,   "公元400年 · 五胡十六国与东西罗马", "南北分立前夜 · 笈多黄金时代 · 匈人西迁", "medieval"),
        ("era_ad500",  500,   "公元500年 · 南北朝与查士丁尼前夜", "北魏南齐 · 东罗马帝国 · 法兰克墨洛温", "medieval"),
        ("era_ad600",  600,   "公元600年 · 隋朝一统与拜占庭", "大隋开皇 · 突厥汗国 · 萨珊与东罗死战", "medieval"),
        ("era_ad700",  700,   "公元700年 · 武周盛唐与倭马亚", "大周与吐蕃 · 倭马亚哈里发横跨欧亚非", "medieval"),
        ("era_ad800",  800,   "公元800年 · 查理曼加冕与阿拔斯", "中唐藩镇 · 阿拔斯巴格达黄金时代 · 查理曼", "medieval"),
        ("era_ad900",  900,   "公元900年 · 五代十国与维京时代", "唐末乱世 · 拜占庭马其顿复兴 · 基辅罗斯", "medieval"),
        ("era_ad1000", 1000,  "公元1000年 · 澶渊宋辽与神圣罗马", "北宋与大辽 · 法蒂玛埃及 · 神圣罗马帝国", "medieval"),
        ("era_ad1100", 1100,  "公元1100年 · 第一次十字军与宋辽夏", "北宋末年 · 塞尔柱突厥 · 耶路撒冷王国", "medieval"),
        ("era_ad1200", 1200,  "公元1200年 · 铁木真崛起前夜", "宋金对峙 · 花剌子模 · 阿尤布王朝 · 金雀花", "medieval"),
        ("era_ad1279", 1279,  "公元1279年 · 蒙古大帝国极盛", "大元一统 · 四大汗国横贯欧亚 · 马穆鲁克", "medieval"),
        ("era_ad1300", 1300,  "公元1300年 · 百年战争前夜与奥斯曼初兴", "元朝鼎盛 · 奥斯曼侯国 · 德里苏丹国", "medieval"),
        ("era_ad1400", 1400,  "公元1400年 · 永乐大明与帖木儿帝国", "大明建文靖难 · 帖木儿西征 · 百年战争", "medieval"),
        ("era_ad1492", 1492,  "公元1492年 · 大航海地理大发现", "明孝宗弘治 · 西班牙收复失地 · 阿兹特克印加", "gunpowder"),
        ("era_ad1500", 1500,  "公元1500年 · 葡萄牙印度洋与弘治大明", "明朝中兴 · 萨非波斯初立 · 意大利战争", "gunpowder"),
        ("era_ad1530", 1530,  "公元1530年 · 查理五世与苏莱曼大帝", "哈布斯堡日不落 · 奥斯曼极盛 · 莫卧儿初建", "gunpowder"),
        ("era_ad1600", 1600,  "公元1600年 · 关原合战与万历朝鲜后", "明万历 · 德川幕府前夜 · 伊丽莎白英格兰", "gunpowder"),
        ("era_ad1650", 1650,  "公元1650年 · 威斯特伐利亚与明清易代", "清初南明 · 三十年战争终结 · 太阳王初立", "gunpowder"),
        ("era_ad1700", 1700,  "公元1700年 · 康熙盛世与大北方战争", "大清康熙 · 彼得大帝俄国 · 路易十四法国", "gunpowder"),
        ("era_ad1715", 1715,  "公元1715年 · 西班牙王位继承战后", "大不列颠成型 · 奥地利崛起 · 雍正前夜", "gunpowder"),
        ("era_ad1783", 1783,  "公元1783年 · 美国独立与乾隆盛世", "美利坚建国 · 大清乾隆全盛 · 法国大革命前夜", "gunpowder"),
        ("era_ad1800", 1800,  "公元1800年 · 拿破仑雾月执政", "法兰西第一执政 · 英国工业革命 · 嘉庆清朝", "gunpowder"),
        ("era_ad1815", 1815,  "公元1815年 · 维也纳体系新秩序", "拿破仑落幕 · 神圣同盟 · 拉美独立浪潮", "gunpowder"),
        ("era_ad1880", 1880,  "公元1880年 · 瓜分非洲与帝国主义", "俾斯麦德意志 · 维多利亚大英 · 明治日本 · 光绪清朝", "ww1"),
        ("era_ad1900", 1900,  "公元1900年 · 世纪之交列强争霸", "英德海权竞逐 · 日俄战争前夜 · 晚清变局", "ww1"),
        ("era_ad1914", 1914,  "公元1914年 · 第一次世界大战全图", "全球列强与殖民帝国 · 同盟 vs 协约", "ww1"),
        ("era_ad1920", 1920,  "公元1920年 · 凡尔赛体系与苏俄内战", "国联初建 · 奥匈奥斯曼解体 · 北洋中国", "ww1"),
        ("era_ad1930", 1930,  "公元1930年 · 大萧条与风暴前夜", "中原大战后 · 苏联五年计划 · 魏玛末期", "ww2"),
        ("era_ad1938", 1938,  "公元1938年 · 慕尼黑危机与全面抗战", "德奥合并 · 武汉会战 · 轴心与同盟对峙", "ww2"),
        ("era_ad1945", 1945,  "公元1945年 · 二战终局与联合国诞生", "冷战序幕 · 核时代开启 · 非殖民化曙光", "modern"),
        ("era_ad1960", 1960,  "公元1960年 · 冷战巅峰与非洲独立年", "美苏太空竞赛 · 中苏分歧 · 第三世界崛起", "modern"),
        ("era_ad1994", 1994,  "公元1994年 · 后冷战多极世界", "苏联解体后新格局 · 欧盟成立 · 改革开放腾飞", "modern"),
        ("era_ad2000", 2000,  "公元2000年 · 千禧新世纪格局", "全球化浪潮 · 欧元诞生 · 多极格局重塑", "modern"),
        ("era_ad2010", 2010,  "公元2010年 · 当代世界全球图景", "21世纪多极博弈 · 新兴大国全面崛起", "modern"),
    ]

    /// 从 HotPack `Eras45/` 目录加载 45 纪元索引与二进制疆界数据包（`eras45_index.json` + `eras45_20k.bin` / `eras45_60k.bin`）。
    public static func loadDirectory(_ dirURL: URL) {
        let indexURL = dirURL.appendingPathComponent("eras45_index.json")
        if let data = try? Data(contentsOf: indexURL),
           let decoded = try? JSONDecoder().decode([PlayableHistoricalEra].self, from: data),
           !decoded.isEmpty {
            store.setEras(decoded)
        }
        for name in ["eras45_20k.bin", "eras45_60k.bin", "eras45_120k.bin", "eras45_v6.bin"] {
            let binURL = dirURL.appendingPathComponent(name)
            if let data = try? Data(contentsOf: binURL), let parsed = parseEraBinary(data) {
                store.setMasks(parsed)
                // 同时注册进 HistoricalBasemaps，使 NativeCreation 自动命中真实国界锁定分州！
                for (_, m) in parsed {
                    HistoricalBasemaps.registerBakedScenario(
                        HistoricalBasemaps.BakedScenarioGIS(
                            id: m.eraId,
                            region: "world",
                            nationCount: m.nationCount,
                            ownerMask: m.ownerMask,
                            popDensity: m.popDensity
                        ),
                        cellCount: m.cellCount
                    )
                }
            }
        }
    }

    public static func mountedEras() -> [PlayableHistoricalEra] {
        let loaded = store.allEras()
        if !loaded.isEmpty { return loaded }
        return builtInTimeline.map {
            PlayableHistoricalEra(id: $0.id, year: $0.year, title: $0.title, subtitle: $0.subtitle, eraLock: $0.era, nationCount: 0)
        }
    }

    public static var mountedMaskCount: Int { store.maskCount() }
    public static var isPackMounted: Bool { !store.allEras().isEmpty && store.maskCount() > 0 }

    /// 解析 `LGE4` 45 纪元二进制国界数据包（支持 20K / 60K / 120K 任意细胞数，零膨胀）。
    public static func parseEraBinary(_ data: Data) -> [String: EraMask]? {
        let b = [UInt8](data)
        guard b.count >= 16, b[0] == 0x4C, b[1] == 0x47, b[2] == 0x45, b[3] == 0x34 else { return nil } // "LGE4"
        var o = 4
        func u16() -> UInt16? {
            guard o + 2 <= b.count else { return nil }
            let v = UInt16(b[o]) | (UInt16(b[o + 1]) << 8); o += 2; return v
        }
        func u32() -> UInt32? {
            guard o + 4 <= b.count else { return nil }
            let v = UInt32(b[o]) | (UInt32(b[o + 1]) << 8) | (UInt32(b[o + 2]) << 16) | (UInt32(b[o + 3]) << 24)
            o += 4; return v
        }
        guard let version = u32(), version == 1,
              let eraCount = u32(), eraCount <= 128,
              let cellCountU32 = u32(), cellCountU32 > 0, cellCountU32 <= 250_000 else { return nil }
        let cellCount = Int(cellCountU32)
        var out = [String: EraMask]()
        out.reserveCapacity(Int(eraCount))
        for _ in 0..<eraCount {
            guard o < b.count else { return nil }
            let idLen = Int(b[o]); o += 1
            guard o + idLen <= b.count else { return nil }
            let eraId = String(decoding: b[o..<(o + idLen)], as: UTF8.self); o += idLen
            guard let natCountU16 = u16(),
                  o + cellCount * 2 <= b.count else { return nil }
            var owners = [Int8](repeating: -1, count: cellCount)
            for i in 0..<cellCount { owners[i] = Int8(bitPattern: b[o + i]) }
            o += cellCount
            let pop = Array(b[o..<(o + cellCount)])
            o += cellCount
            let mask = EraMask(eraId: eraId, cellCount: cellCount, nationCount: Int(natCountU16), ownerMask: owners, popDensity: pop)
            out["\(eraId)@\(cellCount)"] = mask
        }
        return out
    }

    /// 将任意已挂载的 45 纪元即时转换为完整可玩的 `HistoricalScenario`（支持至多 100 国与 2,400 州）。
    public static func buildPlayableScenario(eraId: String, provinceCount: Int = 240, rebelMode: String = "historical") -> HistoricalScenario? {
        guard let era = store.allEras().first(where: { $0.id == eraId }), !era.polities.isEmpty else { return nil }
        let nations: [HistoricalNationSpec] = era.polities.prefix(100).map { p in
            HistoricalNationSpec(
                id: p.id, name: p.name, shortName: p.shortName, color: p.color,
                culture: p.culture, religion: p.religion, polity: p.polity, style: p.style,
                capitalLon: p.capitalLon, capitalLat: p.capitalLat, capitalName: p.capitalName,
                anchors: [],
                rulerName: p.rulerName, rulerTitle: p.rulerTitle,
                rulerMilitary: 72, rulerAdmin: 74, rulerDiplo: 74, rulerCharisma: 74,
                rulerTraits: ["Administrator"]
            )
        }
        return HistoricalScenario(
            id: era.id,
            title: era.title,
            subtitle: era.subtitle,
            region: .world,
            year: era.year,
            eraName: era.yearDisplayText,
            description: "\(era.yearDisplayText) 全球真实历史疆域切面（共 \(nations.count) 个独立政权 · 45 纪元大舆图典藏包实时挂载）。",
            author: "列国纪 · 45 纪元历史库",
            isOfficial: true,
            provinceCount: max(nations.count, provinceCount),
            nations: nations,
            openingWars: [],
            openingAlliances: [],
            tags: ["45纪元", "世界全图", era.yearDisplayText],
            rebelMode: rebelMode,
            eraOverride: era.eraLock
        )
    }
}
