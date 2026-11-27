import Foundation

/// 纯 Swift 建新世界：与网页 src/native-bridge/engine.ts 的 generate(options) + nativeWorld() 逐位相同
/// （Culture47Session.create 的开局段、ENABLE 规则启用、varyPlaceNames、地图与静态几何）。
public enum NativeCreation {
    public struct Options: Sendable {
        public var seed: String, template: String, count: Int, cityCount: Int
        public var relations: String, naming: String, cultures: [String]
        /// 降水（原作的百分比）、气温偏移、纬度上下限；网页 setFmsClimate 的四项。
        public var precipitation: Double = 80, temperatureOffset: Double = 0, north: Double = 0.9, south: Double = -0.9
        /// 自绘地图的高程（每个原作格网格一个）；nil 用模板生成。
        public var heights: [UInt8]? = nil
        /// 手绘州郡的格网归属（每格一个州编号，-1 为海/未划）；nil 时由系统自动按山河划分州郡。
        public var customProvinces: [Int]? = nil
        /// 划定列国：各国首府辖区与每个辖区的所属国（序号）。
        public var layout: (seeds: [Int], owners: [Int])? = nil
        /// 有机自然疆界（移动端新世界默认开启，按山脊河谷阻力分疆；核心单测保持 false 以逐位对照网页基准）。
        public var organicBorders: Bool = false
        /// 真实历史剧本（v5.8.0 历史舆图）：非 nil 时按真实世界底图、历史疆域、政体、君主与开局同盟/战事创建世界。
        public var historicalScenario: HistoricalScenario? = nil
        /// v8.0.0 历史剧本推演路线：`"historical"`（严格史实路线与锁盟，默认）或 `"sandbox"`（多分支架空路线）。
        public var historicalRoute: String = "historical"
        public init(seed: String, template: String, count: Int, cityCount: Int, relations: String = "peace", naming: String = "historical-names", cultures: [String] = []) {
            self.seed = seed; self.template = template; self.count = count; self.cityCount = cityCount; self.relations = relations; self.naming = naming; self.cultures = cultures
        }
    }
    public struct World {
        /// nativeWorld() 的 run（无 terrain）与 statics（含 labelGrid、map）。
        public let run: JS, statics: JS
        /// 实际州数（陆地支离破碎时比所选多）。
        public let cityCount: Int
        /// `{run, statics}` 的 JSON（与网页 nativeWorld() 逐字节相同）。
        public var json: String { let o = JS.object(); o.run = run; o.statics = statics; return o.json }
    }
    public enum CreationError: LocalizedError {
        case message(String)
        public var errorDescription: String? { if case .message(let m) = self { return m }; return nil }
    }

    /// engine.ts raisedCities（20K 放开至 720，60K/120K 高精网自动扩展至 1400/2600 州，打破僵化 280 州限制）。
    static func raised(_ n: Int, cap: Int = 720) -> Int { min(cap, max(n + 1, Int((Double(n) * 1.15).rounded(.up)))) }
    static func maxProvinces(for pointCount: Int) -> Int {
        if pointCount > 80_000 { return 2600 }
        if pointCount > 25_000 { return 1400 }
        return 720
    }
    static let cultureIds = ["chinese", "japanese", "english", "arab", "roman", "french", "german", "greek", "persian", "slavic", "norse", "indian", "korean", "mongol", "turkic",
                             "egyptian", "spanish", "italian", "vietnamese", "tibetan", "hungarian", "polish", "portuguese", "dutch", "aztec", "inca"]

    /// 建一个新世界。目录（NativeEngine.loadCatalogs、OpeningGovernment.loadResources）须已载入。
    /// `worldId` 为地形文档编号（世界种子），`runId` 为局号（"fms-…"）；`progress` 报告阶段（people、armies、map）。
    public static func generate(_ o: Options, inputs x: CreationMap.Inputs, worldId: String, runId: String, progress: ((String) -> Void)? = nil) throws -> World {
        let enabled = cultureIds.filter { o.cultures.isEmpty || o.cultures.contains($0) }
        let doc = x.document
        let provCap = maxProvinces(for: doc.points.count)
        let count: Int
        if let l = o.layout {
            count = l.seeds.count
        } else if let sc = o.historicalScenario {
            count = max(2, min(100, sc.nations.count))
        } else {
            count = max(2, min(100, o.count))
        }
        let baseCityTarget: Int = {
            guard let sc = o.historicalScenario else { return o.cityCount }
            // v10.0.0：开放式地理密度州郡规模，按网格精度自然释放 AoH3/HOI4 级细分（打破固定 280 州限制）
            if doc.points.count > 80_000 {
                return min(1100, Int((Double(sc.provinceCount) * 2.45).rounded()))
            } else if doc.points.count > 25_000 {
                return min(740, Int((Double(sc.provinceCount) * 1.75).rounded()))
            }
            return sc.provinceCount
        }()
        var cityCount = max(count, min(provCap, baseCityTarget))
        Climate.precipitationInput = o.precipitation; Climate.temperatureOffset = o.temperatureOffset; Climate.north = o.north; Climate.south = o.south
        let heights: [Int]
        if let drawn = o.heights {
            guard drawn.count == doc.points.count else { throw CreationError.message("自绘地图与原作网格不一致。") }
            heights = drawn.map { Int(min(100, $0)) }
            if heights.filter({ $0 >= 20 }).count < count * 4 { throw CreationError.message("陆地太少，请再画一些陆地。") }
        } else if let sc = o.historicalScenario {
            if let b64 = sc.customHeightsBase64,
               let decoded = HistoricalScenarios.decodeHeights(b64, expectedCount: doc.points.count) {
                heights = decoded.map { Int(min(100, $0)) }
            } else {
                heights = HistoricalBasemaps.generateHeights(region: sc.region, document: doc).map(Int.init)
            }
            if heights.filter({ $0 >= 20 }).count < count * 4 { throw CreationError.message("历史底图陆地太少，无法生成该剧本。") }
        } else { heights = TerrainGenerator.generate(graph: x.grid, seed: o.seed, template: o.template).map(Int.init) }
        // v11.0.0 按真实陆地格数自适应上限（确保每州至少 12 格，防止日本战国等海岛图在 60K/120K 下被切碎成 740 州耗尽日文地名出「国354」）
        if o.historicalScenario != nil {
            let landCellCount = heights.reduce(0) { $0 + ($1 >= 20 ? 1 : 0) }
            let healthyMax = max(count * 2, landCellCount / 12)
            cityCount = max(count, min(cityCount, healthyMax))
        }
        progress?("people")
        // 陆地太碎（岛屿、湖泊）放不下所选州数时，州数按网页的步长增加直到放得下。
        var found: (run: JS, travel: CreationGeography.Graph, sea: SeaGraph, provinceNames: [String]?, popDensities: [UInt8]?, wastelandCells: [Bool]?)?
        // App 新世界（organicBorders == true）清理极小孤立礁石，避免 80 城模板被 1%–3% 边角微岛占掉名额（手绘自定布局/手绘州郡、历史底图与网页基准测试保持原地形不变）。
        let effectiveHeights = (o.historicalScenario == nil && o.layout == nil && o.customProvinces == nil && o.organicBorders) ? Regions.cleanTinyIslets(doc, elevations: heights, cities: cityCount) : heights
        let hasCustomProvinces = o.customProvinces != nil || o.historicalScenario?.customProvinceCells != nil
        while found == nil {
            found = try openingWithNames(o, doc: doc, heights: effectiveHeights, count: count, cityCount: cityCount, enabled: enabled, worldId: worldId, runId: runId)
            if found == nil {
                if o.layout != nil || hasCustomProvinces || cityCount >= provCap { throw CreationError.message("这片陆地放不下 \(cityCount) 个州郡，请编辑陆地或减少州郡。") }
                cityCount = raised(cityCount, cap: provCap)
            }
        }
        guard let (r, travel, sea, historicalProvinceNames, historicalPopDensities, wastelandCells) = found else {
            throw CreationError.message("无法生成有效世界地图。")
        }
        progress?("armies")
        CreationForces.attach(r, doc, elevations: effectiveHeights, sea: sea, faceBiomes: CreationForces.faceBiomes(doc, elevations: effectiveHeights, ids: Climate.surface(doc, elevations: effectiveHeights).ids), method: "capital-neighbor-v2")
        CreationPolitics.attach(r)
        r.id = JS(runId); r.world.custom.id = JS(runId)
        let statics: JS
        if let sc = o.historicalScenario {
            // v6.0.0 CRITICAL: 先执行历史覆写与史实名臣名将注入（不提前采样回放第 0 帧），
            // 再启用规则、构建静态几何与开局同盟/战事，最后重置并采样真实历史第 0 帧与构建地图！
            HistoricalScenarios.applyOverrides(
                run: r,
                scenario: sc,
                provinceNames: historicalProvinceNames ?? [],
                popDensities: historicalPopDensities,
                engine: nil,
                travel: travel
            )
            let savedOffices = r.offices47.isNull ? nil : r.offices47.clone()
            CreationRules.enable(r)
            if let savedOffices {
                r.offices47 = savedOffices
            }
            if !r.regimes.isNull { r.regimes.replay = .null }
            statics = CreationStatics.build(r, doc, elevations: effectiveHeights, sea: sea, travel: travel, wastelandCells: wastelandCells)
            var warEngine: DeclarationEngine? = nil
            if !sc.openingWars.isEmpty || o.relations == "war" {
                _ = try NativeEngine(created: r, statics: statics)
                War26.install()
                warEngine = Session.engine
            }
            HistoricalScenarios.applyDiplomacy(run: r, scenario: sc, engine: warEngine, route: o.historicalRoute)
            if !r.regimes.isNull {
                // v11.0.0：架空/多分支路线自动启用玩家历史节点抉择弹窗；史实路线保持事件按真实史实自动推演
                r.regimes.playerInteractiveEvents = JS(o.historicalRoute == "sandbox")
            }
            if o.relations == "war" && sc.openingWars.isEmpty, let engine = warEngine {
                CreationPolitics.openingWars(r, engine: engine)
            }
            Shipyards.remember(r)
            if !r.regimes.isNull {
                r.regimes.replay = .null
                ReplayEngine.capture(r, force: true)
            }
        } else {
            statics = CreationStatics.build(r, doc, elevations: effectiveHeights, sea: sea, travel: travel)
            if o.relations == "war" {
                _ = try NativeEngine(created: r, statics: statics)
                War26.install()
                guard let engine = Session.engine else { throw CreationError.message("外交数据尚未载入。") }
                CreationPolitics.openingWars(r, engine: engine)
            }
            CreationRules.enable(r)
            CreationNames.vary(r, seed: o.seed)
        }
        progress?("map")
        if let sc = o.historicalScenario, sc.region != .custom {
            let riverMap = HistoricalGeography.riverProvinces(
                region: sc.region,
                provinces: r.world.provinces.asArray,
                scale: r.scale.asNumber,
                width: doc.width,
                height: doc.height
            )
            for (pid, rName) in riverMap {
                if !r.terrainContext.isNull && !r.terrainContext.provinces[pid].isNull {
                    r.terrainContext.provinces[pid].hasMajorRiver = JS(true)
                    r.terrainContext.provinces[pid].riverName = JS(rName)
                }
                if !r.upperCombat.isNull && !r.upperCombat.provinces[pid].isNull {
                    let cur = r.upperCombat.provinces[pid].storedDefense.optionalNumber ?? 1.0
                    r.upperCombat.provinces[pid].storedDefense = JS(min(3.0, cur + 0.35))
                }
            }
        }
        let map = CreationMap.build(x, run: r, elevations: effectiveHeights, seed: o.seed, template: o.template, historicalRegion: o.historicalScenario?.region, wastelandCells: wastelandCells)
        statics.labelGrid = CreationMap.labelGrid(x.grid, elevations: effectiveHeights, cells: map.cells)
        statics.map = map.map
        return World(run: r, statics: statics, cityCount: r.world.provinces.length)
    }

    /// createCivilizationWorld47 + attachGovernment47（含开局军队位置）。nil：这片陆地放不下 `cityCount` 个州。
    static func opening(_ o: Options, doc: TerrainDocument, heights: [Int], count: Int, cityCount: Int, enabled: [String], worldId: String, runId: String) throws -> (run: JS, travel: CreationGeography.Graph, sea: SeaGraph)? {
        guard let res = try openingWithNames(o, doc: doc, heights: heights, count: count, cityCount: cityCount, enabled: enabled, worldId: worldId, runId: runId) else { return nil }
        return (res.run, res.travel, res.sea)
    }

    private static func openingWithNames(_ o: Options, doc: TerrainDocument, heights: [Int], count: Int, cityCount: Int, enabled: [String], worldId: String, runId: String) throws -> (run: JS, travel: CreationGeography.Graph, sea: SeaGraph, provinceNames: [String]?, popDensities: [UInt8]?, wastelandCells: [Bool]?)? {
        let regions: [Regions.Region]
        let layout: (seeds: [Int], owners: [Int])
        var historicalProvinceNames: [String]? = nil
        var historicalPopDensities: [UInt8]? = nil
        var wastelandCells: [Bool]? = nil

        let customCells = o.customProvinces ?? o.historicalScenario?.customProvinceCells
        if let customCells, let customPart = Regions.fromCellAssignment(doc, elevations: heights, cellProvinces: customCells) {
            regions = customPart.regions
            let effCount = max(2, min(count, regions.count))
            if let l = o.layout {
                layout = l
            } else if let sc = o.historicalScenario {
                let built = HistoricalScenarios.buildLayout(scenario: sc, regions: regions, width: doc.width, height: doc.height)
                layout = (built.seeds, built.owners)
                historicalProvinceNames = built.provinceNames
            } else {
                layout = o.organicBorders ? Opening.organicLayout(regions, count: effCount, seed: o.seed) : Opening.layout(regions, count: effCount)
            }
        } else if let sc = o.historicalScenario,
                  o.layout == nil,
                  let gis = HistoricalBasemaps.bakedScenarioGIS(id: sc.id, expectedCount: doc.points.count),
                  gis.ownerMask.count == doc.points.count,
                  gis.nationCount == sc.nations.count,
                  let borderPart = Regions.partitionWithinBordersWithFaces(doc, elevations: heights, ownerMask: gis.ownerMask, cities: cityCount, historicalRegion: sc.region, popDensity: gis.popDensity) {
            regions = borderPart.regions
            if gis.ownerMask.contains(-2) {
                wastelandCells = gis.ownerMask.map { $0 == -2 }
            }
            var lockedOwners = borderPart.owners
            let seeds = HistoricalScenarios.pickSeedsForLockedOwners(
                scenario: sc,
                regions: regions,
                owners: &lockedOwners,
                width: doc.width,
                height: doc.height
            )
            layout = (seeds, lockedOwners)
            historicalProvinceNames = HistoricalScenarios.assignProvinceNames(
                scenario: sc,
                regions: regions,
                owners: lockedOwners,
                seeds: seeds,
                width: doc.width,
                height: doc.height
            )
            // 按每个州郡所属三角面的源网格顶点计算真实人口/工业密度均值（10...255）
            var densities = [UInt8]()
            densities.reserveCapacity(regions.count)
            let popArr = gis.popDensity
            for reg in regions {
                var sum = 0
                var cnt = 0
                var seenVerts = Set<Int>()
                for fi in reg.members where fi >= 0 && fi < borderPart.faces.count {
                    for v in borderPart.faces[fi].source where v >= 0 && v < popArr.count && seenVerts.insert(v).inserted {
                        let d = Int(popArr[v])
                        if d > 0 {
                            sum += d
                            cnt += 1
                        }
                    }
                }
                let avg = cnt > 0 ? max(10, min(255, (sum + cnt / 2) / cnt)) : 80
                densities.append(UInt8(avg))
            }
            historicalPopDensities = densities
        } else {
            guard let part = Regions.partition(doc, elevations: heights, cities: cityCount, balanceAreas: o.layout == nil && (o.organicBorders || o.historicalScenario != nil)) else { return nil }
            regions = part.regions
            let effCount = max(2, min(count, regions.count))
            if let l = o.layout {
                layout = l
            } else if let sc = o.historicalScenario {
                let built = HistoricalScenarios.buildLayout(scenario: sc, regions: regions, width: doc.width, height: doc.height)
                layout = (built.seeds, built.owners)
                historicalProvinceNames = built.provinceNames
            } else {
                layout = o.organicBorders ? Opening.organicLayout(regions, count: effCount, seed: o.seed) : Opening.layout(regions, count: effCount)
            }
        }
        if let l = o.layout, l.owners.count != regions.count || l.seeds.contains(where: { $0 < 0 || $0 >= regions.count }) { throw CreationError.message("国家领土布局无效，原稿未改动。") }
        let preferredCultures = o.historicalScenario?.nations.map(\.culture)
        guard let r = Creation.base(regions: regions, seeds: layout.seeds, owners: layout.owners, width: doc.width, height: doc.height, worldId: worldId, runId: runId,
                                    relations: "peace", mode: o.naming == "culture-generated" ? "culture-generated" : "historical-names", enabled: enabled, cultures: Founding.cultures, preferredCultures: preferredCultures)
        else { throw CreationError.message("新世界国家、城市或关系配置无效。") }
        Creation.attachFamilies(r); Creation.attachOrigins(r); Creation.attachNobility(r)
        r.reigns47 = .object(); r.stateTraits47 = .object()
        // attachGovernment47。
        let scale = r.scale.asNumber
        let g = OpeningGovernment.provinceGeography(doc, elevations: heights, provinces: r.world.provinces.asArray, scale: scale)
        OpeningGovernment.attach(r, terrain: g.terrain, cells: g.cells, combat: g.combat)
        let provinces = r.world.provinces.asArray
        let sea = SeaGraph(doc, elevations: heights, provinces: provinces, blockedRegion: o.historicalScenario?.region)
        guard let travel = CreationGeography.buildTravel(doc, elevations: heights, provinces: provinces, sea: sea, allowWasteland: wastelandCells != nil) else { return nil }
        let positions = CreationGeography.armyPositions(r, graph: travel, binding: CreationGeography.binding(doc, elevations: heights, provinces: provinces))
        // 政府段各字段按网页的顺序排在整局末尾。
        let staged: [(String, JS)] = [("units", r.units), ("tactics", r.tactics), ("terrainContext", r.terrainContext), ("upperCombat", r.upperCombat), ("finance", r.finance),
                                      ("economy", r.economy), ("destiny", r.destiny), ("armyPositions", positions), ("governmentOpening", r.governmentOpening)]
        for (k, _) in staged { r.delete(k) }
        for (k, v) in staged { r[k] = v }
        return (r, travel, sea, historicalProvinceNames, historicalPopDensities, wastelandCells)
    }
}
