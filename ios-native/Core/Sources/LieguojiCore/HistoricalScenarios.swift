import Foundation

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
    public var tags: [String]

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
        tags: [String] = []
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
        self.tags = tags
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

/// 官方 8 大真实历史剧本库、历史版图/州郡自动布局与整局状态覆写引擎。
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

    // MARK: - 1. 历史版图与真实州郡命名布局

    /// 按历史剧本中各国的都城与地理锚点，将底图上的全部州郡划归对应历史势力并赋予地道历史州郡名。
    public static func buildLayout(
        scenario: HistoricalScenario,
        regions: [Regions.Region],
        width: Double,
        height: Double
    ) -> (seeds: [Int], owners: [Int], provinceNames: [String]) {
        guard !regions.isEmpty, !scenario.nations.isEmpty else { return ([], [], []) }
        let nationCount = min(scenario.nations.count, regions.count)
        let activeSpecs = Array(scenario.nations.prefix(nationCount))

        // 1. 为每个国家在最近且未占用的州郡上落定都城（seed）
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

        // 2. 展开各国全部加权地理锚点（都城 + 历史重镇锚点）
        struct ProjectedAnchor {
            let nationIndex: Int
            let x: Double
            let y: Double
            let name: String
            let invWeightSq: Double
            let isCapital: Bool
        }
        var allAnchors = [ProjectedAnchor]()
        allAnchors.reserveCapacity(nationCount * 8)
        for (ni, spec) in activeSpecs.enumerated() {
            let cap = capitalCoords[ni]
            let capWeight = 1.25
            allAnchors.append(ProjectedAnchor(
                nationIndex: ni,
                x: cap.0,
                y: cap.1,
                name: spec.capitalName,
                invWeightSq: 1.0 / (capWeight * capWeight),
                isCapital: true
            ))
            for a in spec.anchors {
                let pt = HistoricalBasemaps.project(lon: a.lon, lat: a.lat, region: scenario.region, width: width, height: height)
                let w = max(0.2, a.weight)
                allAnchors.append(ProjectedAnchor(
                    nationIndex: ni,
                    x: pt.0,
                    y: pt.1,
                    name: a.provinceName,
                    invWeightSq: 1.0 / (w * w),
                    isCapital: false
                ))
            }
        }

        // 3. 逐州郡按加权平方距离归属国家并选取最近锚点名称
        var seedToNation = [Int: Int]()
        for (ni, s) in seeds.enumerated() { seedToNation[s] = ni }

        var owners = [Int](repeating: 0, count: regions.count)
        var rawNames = [String](repeating: "", count: regions.count)
        var anchorDelta = [(dx: Double, dy: Double, distSq: Double)](repeating: (0, 0, 0), count: regions.count)

        for (ri, reg) in regions.enumerated() {
            if let ni = seedToNation[ri] {
                owners[ri] = ni
                rawNames[ri] = activeSpecs[ni].capitalName
                anchorDelta[ri] = (0, 0, 0)
                continue
            }
            var bestNation = 0
            var bestName = activeSpecs[0].capitalName
            var bestScore = Double.infinity
            var bestDx = 0.0, bestDy = 0.0, bestRawDistSq = Double.infinity

            for anchor in allAnchors {
                let dx = reg.center.0 - anchor.x
                let dy = reg.center.1 - anchor.y
                let d2 = dx * dx + dy * dy
                let score = d2 * anchor.invWeightSq
                if score < bestScore {
                    bestScore = score
                    bestNation = anchor.nationIndex
                    bestName = anchor.name
                    bestDx = dx
                    bestDy = dy
                    bestRawDistSq = d2
                }
            }
            owners[ri] = bestNation
            rawNames[ri] = bestName
            anchorDelta[ri] = (bestDx, bestDy, bestRawDistSq)
        }

        // 保底校验：确保每个国家至少控制其都城州郡
        for (ni, s) in seeds.enumerated() {
            owners[s] = ni
            rawNames[s] = activeSpecs[ni].capitalName
        }

        // 4. 州郡名去重：都城优先保留原名，其余同名重镇按最近者取本名，周边州郡加方位后缀或文化历史城池补全
        var usedNames = Set<String>()
        var finalNames = [String](repeating: "", count: regions.count)

        // 先锁定全部都城原名
        for (ni, s) in seeds.enumerated() {
            let base = activeSpecs[ni].capitalName
            if usedNames.insert(base).inserted {
                finalNames[s] = base
            } else {
                let unique = "\(activeSpecs[ni].shortName)\(base)"
                usedNames.insert(unique)
                finalNames[s] = unique
            }
        }

        // 构建文化备选历史地名池（按文化分组，用于方位变体用尽时补足，保证零重名）
        var extraByCulture = [String: [String]]()
        for entry in CreationNames.extraPlaces {
            extraByCulture[entry.culture] = entry.names
        }
        var extraCursor = [String: Int]()

        // 按距离锚点由近及远排序，确保最贴近历史重镇坐标的州郡获得纯正原名
        let nonSeeds = regions.indices
            .filter { seedToNation[$0] == nil }
            .sorted { a, b in
                if anchorDelta[a].distSq != anchorDelta[b].distSq {
                    return anchorDelta[a].distSq < anchorDelta[b].distSq
                }
                return a < b
            }

        func directionalCandidates(base: String, dx: Double, dy: Double) -> [String] {
            // 画布 y 向下增大，故 dy < 0 为北、dy > 0 为南
            let primary: String
            let ax = abs(dx), ay = abs(dy)
            if ax > ay * 1.4 {
                primary = dx >= 0 ? "东" : "西"
            } else if ay > ax * 1.4 {
                primary = dy <= 0 ? "北" : "南"
            } else {
                primary = (dy <= 0 ? "北" : "南") + (dx >= 0 ? "东" : "西")
            }
            let ordered = [primary, "东", "西", "南", "北", "上", "下", "内", "外", "中", "前", "后"]
            var seen = Set<String>()
            var result = [String]()
            for dir in ordered where seen.insert(dir).inserted {
                result.append("\(base)\(dir)")
            }
            return result
        }

        for ri in nonSeeds {
            let base = rawNames[ri].isEmpty ? activeSpecs[owners[ri]].capitalName : rawNames[ri]
            if usedNames.insert(base).inserted {
                finalNames[ri] = base
                continue
            }
            let d = anchorDelta[ri]
            var picked: String? = nil
            for cand in directionalCandidates(base: base, dx: d.dx, dy: d.dy) {
                if usedNames.insert(cand).inserted {
                    picked = cand
                    break
                }
            }
            if picked == nil {
                let culture = activeSpecs[owners[ri]].culture
                if let pool = extraByCulture[culture], !pool.isEmpty {
                    var idx = extraCursor[culture] ?? 0
                    while idx < pool.count {
                        let cand = pool[idx]
                        idx += 1
                        if usedNames.insert(cand).inserted {
                            picked = cand
                            break
                        }
                    }
                    extraCursor[culture] = idx
                }
            }
            if let picked {
                finalNames[ri] = picked
            } else {
                var n = 2
                while !usedNames.insert("\(base)\(n)").inserted { n += 1 }
                finalNames[ri] = "\(base)\(n)"
            }
        }

        return (seeds, owners, finalNames)
    }

    // MARK: - 2. 整局历史设定覆写（国名、版图文化信仰、细分政体、真实领袖、纪年、同盟与开局战事）

    /// 将历史剧本的真实设定覆写到新建的 `run` 中：
    /// 包括世界标题、历史纪年、州郡城名、国名与色号、文化与国教、细分政体、真实开国领袖四维与特质、历史同盟与开局战事。
    public static func applyOverrides(
        run r: JS,
        scenario: HistoricalScenario,
        provinceNames: [String],
        engine: DeclarationEngine? = nil
    ) {
        Regimes.enable(r)

        // 1. 世界标题、真实历史纪年与防随机覆写保护标记
        if !r.world.isNull && !r.world.custom.isNull {
            r.world.custom.name = JS(scenario.title)
        }
        let cal = JS.object()
        cal.era = JS(scenario.eraName)
        cal.offset = JS(scenario.year - 1)
        r.regimes.calendar = cal
        r.regimes.era = JS(scenario.eraName)
        r.regimes.yearOffset = JS(scenario.year - 1)
        r.regimes.historicalScenarioId = JS(scenario.id)
        r.regimes.namesVaried = JS(true)
        r.regimes.distinctColors = JS(true)
        r.regimes.faithReady = JS(true)
        if r.regimes.faith.isNull { r.regimes.faith = JS.object() }
        if r.regimes.style.isNull { r.regimes.style = JS.object() }

        // 2. 覆写全部州郡与城池的历史地名
        let provinces = r.world.provinces.asArray
        let cities = r.world.cities.asArray
        var cityByProvince = [String: JS]()
        for c in cities {
            if let pid = c.provinceId.optionalString { cityByProvince[pid] = c }
        }
        for (i, p) in provinces.enumerated() where i < provinceNames.count {
            let pname = provinceNames[i]
            guard !pname.isEmpty else { continue }
            p.name = JS(pname)
            let city: JS? = (i < cities.count && cities[i].provinceId.optionalString == p.id.optionalString)
                ? cities[i]
                : cityByProvince[p.id.asString]
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

        // 3. 逐国覆写国名、配色、文化、宗教、政体细分与真实历史领袖
        let nations = r.world.nations.asArray
        var specIdToNationId = [String: String]()
        var nationIdToSpec = [String: HistoricalNationSpec]()
        let validCultures = Set(NativeCreation.cultureIds)

        for (i, n) in nations.enumerated() where i < scenario.nations.count {
            let spec = scenario.nations[i]
            let nid = n.id.asString
            specIdToNationId[spec.id] = nid
            nationIdToSpec[nid] = spec

            // 校验 style 严格存在于 Regimes.styles / PolitySystem.styleProfiles
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

            // 写入 regimes.nations[nid].style（引擎真实读取路径）及 regimes.style[nid]
            let book = Regimes.book(r, nid)
            book.style = JS(resolvedStyle.id)
            book.history = .array([JS(validPolity)])
            book.empires = JS(validPolity == "Empire" ? 1 : 0)
            book.parties = .null
            r.regimes.style[nid] = JS(resolvedStyle.id)

            // 同步本国控制州郡的地图文化与地方信仰
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

            // 同步国内世家与宗族的文化、宗教
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

            // 覆写开国领袖（chronicle.leaders / civilization.rulers / people.persons / kin.persons / 开篇史册）
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

        // 同步开局军团番号与真实州郡名
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

        // 4. 缔结历史既定同盟（先建同盟再宣战，使开局战事自然形成同盟阵营联动）
        applyOpeningAlliances(run: r, scenario: scenario, specIdToNationId: specIdToNationId)

        // 5. 发动历史既定开局战争
        applyOpeningWars(run: r, scenario: scenario, specIdToNationId: specIdToNationId, engine: engine ?? Session.engine)

        // 6. 写入世家开局关系
        FamilyPolitics.seedOpeningRelations(r, seed: r.world.custom.seed.optionalString ?? scenario.id)
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
        specIdToNationId: [String: String]
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
            rec.unbreakable = JS(false)
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
    private static func registerHistoricalWarDirectly(
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

    // MARK: - 3. 官方精选 8 大真实历史剧本库

    public static let officialScenarios: [HistoricalScenario] = [
        zhanguo260BCE,
        sanguo208,
        tang755,
        sengoku1560,
        napoleon1812,
        ww1_1914,
        ww2Europe1939,
        ww2Asia1941,
    ]

    // 剧本 1：战国七雄（公元前 260 年 · 长平决战前夜）
    private static let zhanguo260BCE = HistoricalScenario(
        id: "zhanguo_260bce",
        title: "战国七雄",
        subtitle: "长平决战 · 合纵连横",
        region: .china,
        year: -260,
        eraName: "周赧王五十五年",
        description: "公元前260年，秦昭襄王远交近攻、白起陈兵上党，与赵国爆发决定天下命运的长平之战。三晋合纵岌岌可危，齐楚燕虎视关东，漠北匈奴与岭南百越各据一方。",
        author: "列国纪官方",
        isOfficial: true,
        provinceCount: 115,
        nations: [
            HistoricalNationSpec(
                id: "qin", name: "秦国", shortName: "秦", color: "#363E4A",
                culture: "chinese", religion: "confucian", polity: "Empire", style: "despotism",
                capitalLon: 108.7, capitalLat: 34.3, capitalName: "咸阳",
                anchors: [
                    HistoricalAnchor(lon: 107.2, lat: 34.4, provinceName: "关中", weight: 1.2),
                    HistoricalAnchor(lon: 104.1, lat: 30.7, provinceName: "巴蜀", weight: 1.35),
                    HistoricalAnchor(lon: 106.5, lat: 29.6, provinceName: "巴郡", weight: 1.1),
                    HistoricalAnchor(lon: 107.0, lat: 33.1, provinceName: "汉中", weight: 1.15),
                    HistoricalAnchor(lon: 110.9, lat: 35.1, provinceName: "河东", weight: 0.95),
                    HistoricalAnchor(lon: 109.7, lat: 37.8, provinceName: "上郡", weight: 1.05),
                    HistoricalAnchor(lon: 104.0, lat: 35.4, provinceName: "陇西", weight: 1.25),
                    HistoricalAnchor(lon: 112.1, lat: 31.8, provinceName: "南郡", weight: 1.0),
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
                    HistoricalAnchor(lon: 112.5, lat: 37.9, provinceName: "太原", weight: 1.05),
                    HistoricalAnchor(lon: 111.7, lat: 40.5, provinceName: "云中", weight: 1.0),
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
                    HistoricalAnchor(lon: 121.2, lat: 37.1, provinceName: "胶东", weight: 1.1),
                    HistoricalAnchor(lon: 116.8, lat: 36.6, provinceName: "济北", weight: 0.95),
                    HistoricalAnchor(lon: 119.3, lat: 35.6, provinceName: "琅琊", weight: 1.0),
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
                    HistoricalAnchor(lon: 118.4, lat: 32.2, provinceName: "淮南", weight: 1.05),
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
                    HistoricalAnchor(lon: 113.8, lat: 35.3, provinceName: "河内", weight: 0.85),
                    HistoricalAnchor(lon: 110.5, lat: 35.6, provinceName: "河西", weight: 0.8),
                    HistoricalAnchor(lon: 111.2, lat: 35.1, provinceName: "安邑", weight: 0.85),
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
                    HistoricalAnchor(lon: 112.5, lat: 33.7, provinceName: "南阳", weight: 0.8),
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
                    HistoricalAnchor(lon: 123.2, lat: 41.3, provinceName: "辽东", weight: 1.25),
                    HistoricalAnchor(lon: 117.4, lat: 40.1, provinceName: "渔阳", weight: 1.0),
                    HistoricalAnchor(lon: 115.9, lat: 39.4, provinceName: "涿郡", weight: 0.95),
                    HistoricalAnchor(lon: 120.4, lat: 41.6, provinceName: "右北平", weight: 1.1),
                    HistoricalAnchor(lon: 126.5, lat: 39.0, provinceName: "乐浪", weight: 1.25),
                ],
                rulerName: "姬喜", rulerTitle: "燕王喜",
                rulerMilitary: 62, rulerAdmin: 60, rulerDiplo: 65, rulerCharisma: 62,
                rulerTraits: ["Ambitious", "Stubborn"]
            ),
            HistoricalNationSpec(
                id: "xiongnu", name: "匈奴单于庭", shortName: "匈奴", color: "#B87333",
                culture: "mongol", religion: "tengri", polity: "Tribal", style: "khanate",
                capitalLon: 109.8, capitalLat: 41.2, capitalName: "头曼城",
                anchors: [
                    HistoricalAnchor(lon: 108.0, lat: 40.5, provinceName: "朔方", weight: 1.25),
                    HistoricalAnchor(lon: 103.0, lat: 47.2, provinceName: "漠北", weight: 1.65),
                    HistoricalAnchor(lon: 95.0, lat: 42.5, provinceName: "河西大漠", weight: 1.6),
                    HistoricalAnchor(lon: 85.0, lat: 41.5, provinceName: "西域", weight: 1.8),
                    HistoricalAnchor(lon: 119.0, lat: 46.5, provinceName: "东胡草原", weight: 1.55),
                    HistoricalAnchor(lon: 91.0, lat: 32.0, provinceName: "西羌高原", weight: 1.75),
                ],
                rulerName: "头曼", rulerTitle: "单于",
                rulerMilitary: 84, rulerAdmin: 58, rulerDiplo: 62, rulerCharisma: 78,
                rulerTraits: ["Hawkish", "Brave", "Conqueror"]
            ),
            HistoricalNationSpec(
                id: "baiyue", name: "百越诸部", shortName: "百越", color: "#2A7A68",
                culture: "vietnamese", religion: "chineseFolk", polity: "Tribal", style: "chiefdom",
                capitalLon: 113.3, capitalLat: 23.1, capitalName: "番禺",
                anchors: [
                    HistoricalAnchor(lon: 119.3, lat: 26.1, provinceName: "东冶", weight: 1.25),
                    HistoricalAnchor(lon: 110.3, lat: 25.3, provinceName: "桂林", weight: 1.2),
                    HistoricalAnchor(lon: 108.3, lat: 22.8, provinceName: "象郡", weight: 1.25),
                    HistoricalAnchor(lon: 105.8, lat: 21.0, provinceName: "交趾", weight: 1.3),
                    HistoricalAnchor(lon: 102.7, lat: 25.0, provinceName: "滇国", weight: 1.45),
                    HistoricalAnchor(lon: 121.0, lat: 23.8, provinceName: "夷洲", weight: 1.2),
                ],
                rulerName: "无诸", rulerTitle: "闽越王",
                rulerMilitary: 72, rulerAdmin: 66, rulerDiplo: 68, rulerCharisma: 74,
                rulerTraits: ["NavalMastery", "BattleHardened"]
            ),
        ],
        openingWars: [
            HistoricalWarSpec(attackerId: "qin", defenderId: "zhao", casusBelli: "长平之战 · 上党决战"),
        ],
        openingAlliances: [
            HistoricalAllianceSpec(name: "合纵抗秦同盟", memberIds: ["zhao", "wei", "han"]),
        ],
        tags: ["先秦", "中国", "长平之战", "经典"]
    )

    // 剧本 2：三国鼎立 · 赤壁风云（公元 208 年 · 建安十三年）
    private static let sanguo208 = HistoricalScenario(
        id: "sanguo_208",
        title: "三国鼎立 · 赤壁风云",
        subtitle: "曹操南下 · 孙刘合纵",
        region: .china,
        year: 208,
        eraName: "建安十三年",
        description: "建安十三年，曹操平定河北后挥师南下荆州，舳舻千里直指江东。孙权、刘备结盟于柴桑，赤壁烈火一触即发；益州刘璋、西凉马腾、汉中张鲁与辽东公孙各守一方。",
        author: "列国纪官方",
        isOfficial: true,
        provinceCount: 120,
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
                    HistoricalAnchor(lon: 112.5, lat: 37.9, provinceName: "并州", weight: 1.15),
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
                    HistoricalAnchor(lon: 119.0, lat: 26.5, provinceName: "建安", weight: 1.25),
                    HistoricalAnchor(lon: 113.3, lat: 23.1, provinceName: "番禺", weight: 1.35),
                    HistoricalAnchor(lon: 106.5, lat: 21.2, provinceName: "交州", weight: 1.35),
                    HistoricalAnchor(lon: 121.0, lat: 23.8, provinceName: "夷洲", weight: 1.2),
                ],
                rulerName: "孙权", rulerTitle: "吴侯",
                rulerMilitary: 80, rulerAdmin: 86, rulerDiplo: 88, rulerCharisma: 86,
                rulerTraits: ["NavalMastery", "Diplomatic", "SeaVision"]
            ),
            HistoricalNationSpec(
                id: "liubei", name: "刘备军", shortName: "汉", color: "#2E8B57",
                culture: "chinese", religion: "confucian", polity: "Kingdom", style: "feudal",
                capitalLon: 112.2, capitalLat: 30.3, capitalName: "江陵",
                anchors: [
                    HistoricalAnchor(lon: 114.2, lat: 30.5, provinceName: "夏口", weight: 0.9),
                    HistoricalAnchor(lon: 111.7, lat: 29.0, provinceName: "武陵", weight: 1.05),
                    HistoricalAnchor(lon: 111.6, lat: 26.4, provinceName: "零陵", weight: 1.1),
                    HistoricalAnchor(lon: 113.0, lat: 28.2, provinceName: "长沙", weight: 1.05),
                    HistoricalAnchor(lon: 113.0, lat: 25.8, provinceName: "桂阳", weight: 1.0),
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
                    HistoricalAnchor(lon: 100.2, lat: 25.6, provinceName: "永昌", weight: 1.35),
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
                    HistoricalAnchor(lon: 104.2, lat: 35.1, provinceName: "陇西", weight: 1.05),
                    HistoricalAnchor(lon: 94.7, lat: 40.1, provinceName: "敦煌", weight: 1.55),
                    HistoricalAnchor(lon: 85.0, lat: 41.2, provinceName: "西域长史府", weight: 1.8),
                    HistoricalAnchor(lon: 92.0, lat: 31.5, provinceName: "羌中高原", weight: 1.65),
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
                    HistoricalAnchor(lon: 106.8, lat: 31.8, provinceName: "巴中", weight: 0.85),
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
                    HistoricalAnchor(lon: 128.5, lat: 35.8, provinceName: "三韩", weight: 1.25),
                    HistoricalAnchor(lon: 126.5, lat: 43.8, provinceName: "玄菟", weight: 1.3),
                ],
                rulerName: "公孙康", rulerTitle: "辽东太守",
                rulerMilitary: 70, rulerAdmin: 72, rulerDiplo: 68, rulerCharisma: 66,
                rulerTraits: ["Patient", "Administrator"]
            ),
            HistoricalNationSpec(
                id: "xianbei", name: "鲜卑诸部", shortName: "鲜卑", color: "#B7950B",
                culture: "mongol", religion: "tengri", polity: "Tribal", style: "khanate",
                capitalLon: 114.2, capitalLat: 42.4, capitalName: "弹汗山",
                anchors: [
                    HistoricalAnchor(lon: 110.0, lat: 41.2, provinceName: "阴山", weight: 1.25),
                    HistoricalAnchor(lon: 104.0, lat: 47.0, provinceName: "漠北", weight: 1.65),
                    HistoricalAnchor(lon: 121.0, lat: 47.5, provinceName: "兴安岭", weight: 1.55),
                    HistoricalAnchor(lon: 98.0, lat: 44.0, provinceName: "漠西草原", weight: 1.5),
                ],
                rulerName: "轲比能", rulerTitle: "大人",
                rulerMilitary: 86, rulerAdmin: 68, rulerDiplo: 72, rulerCharisma: 82,
                rulerTraits: ["Brave", "Hawkish", "Tactician"]
            ),
        ],
        openingWars: [
            HistoricalWarSpec(attackerId: "caowei", defenderId: "liubei", casusBelli: "赤壁之战 · 荆襄南征"),
            HistoricalWarSpec(attackerId: "caowei", defenderId: "sunwu", casusBelli: "赤壁之战 · 江东决战"),
        ],
        openingAlliances: [
            HistoricalAllianceSpec(name: "孙刘联盟", memberIds: ["sunwu", "liubei"]),
        ],
        tags: ["三国", "赤壁之战", "中国", "名将"]
    )

    // 剧本 3：盛唐天宝（公元 755 年 · 天宝十四载）
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
        provinceCount: 130,
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
                    HistoricalAnchor(lon: 114.3, lat: 34.8, provinceName: "汴州", weight: 1.2),
                    HistoricalAnchor(lon: 112.2, lat: 30.3, provinceName: "江陵", weight: 1.25),
                    HistoricalAnchor(lon: 102.6, lat: 37.9, provinceName: "凉州", weight: 1.25),
                    HistoricalAnchor(lon: 94.7, lat: 40.1, provinceName: "敦煌", weight: 1.3),
                    HistoricalAnchor(lon: 82.9, lat: 41.7, provinceName: "安西", weight: 1.35),
                    HistoricalAnchor(lon: 89.2, lat: 44.0, provinceName: "北庭", weight: 1.3),
                    HistoricalAnchor(lon: 118.6, lat: 24.9, provinceName: "泉州", weight: 1.3),
                    HistoricalAnchor(lon: 105.8, lat: 21.0, provinceName: "安南", weight: 1.3),
                    HistoricalAnchor(lon: 119.5, lat: 36.6, provinceName: "青州", weight: 1.2),
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
                    HistoricalAnchor(lon: 100.2, lat: 36.4, provinceName: "青海", weight: 1.25),
                    HistoricalAnchor(lon: 103.6, lat: 32.6, provinceName: "松州", weight: 1.0),
                    HistoricalAnchor(lon: 88.9, lat: 29.3, provinceName: "日喀则", weight: 1.35),
                    HistoricalAnchor(lon: 80.1, lat: 32.5, provinceName: "阿里", weight: 1.45),
                    HistoricalAnchor(lon: 92.0, lat: 34.5, provinceName: "那曲", weight: 1.35),
                ],
                rulerName: "赤松德赞", rulerTitle: "赞普",
                rulerMilitary: 88, rulerAdmin: 82, rulerDiplo: 76, rulerCharisma: 86,
                rulerTraits: ["Brave", "Conqueror", "Ambitious"]
            ),
            HistoricalNationSpec(
                id: "uyghur", name: "回纥汗国", shortName: "回纥", color: "#2D7FB8",
                culture: "turkic", religion: "tengri", polity: "Tribal", style: "khanate",
                capitalLon: 102.8, capitalLat: 47.2, capitalName: "鄂尔浑",
                anchors: [
                    HistoricalAnchor(lon: 107.0, lat: 47.8, provinceName: "漠北", weight: 1.55),
                    HistoricalAnchor(lon: 100.5, lat: 42.5, provinceName: "甘州北", weight: 1.25),
                    HistoricalAnchor(lon: 91.0, lat: 48.0, provinceName: "阿尔泰", weight: 1.55),
                    HistoricalAnchor(lon: 117.0, lat: 48.0, provinceName: "室韦草原", weight: 1.5),
                    HistoricalAnchor(lon: 112.0, lat: 43.2, provinceName: "漠南", weight: 1.3),
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
                    HistoricalAnchor(lon: 100.5, lat: 25.9, provinceName: "大理", weight: 1.1),
                    HistoricalAnchor(lon: 102.7, lat: 25.0, provinceName: "拓东", weight: 1.2),
                    HistoricalAnchor(lon: 99.1, lat: 25.1, provinceName: "永昌", weight: 1.15),
                    HistoricalAnchor(lon: 101.8, lat: 22.8, provinceName: "蒙舍", weight: 1.15),
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
                    HistoricalAnchor(lon: 123.5, lat: 41.8, provinceName: "辽东", weight: 1.15),
                    HistoricalAnchor(lon: 130.5, lat: 42.9, provinceName: "东京龙原府", weight: 1.25),
                    HistoricalAnchor(lon: 126.6, lat: 45.8, provinceName: "靺鞨北", weight: 1.4),
                    HistoricalAnchor(lon: 133.0, lat: 47.5, provinceName: "黑水", weight: 1.45),
                ],
                rulerName: "大钦茂", rulerTitle: "渤海文王",
                rulerMilitary: 72, rulerAdmin: 84, rulerDiplo: 82, rulerCharisma: 80,
                rulerTraits: ["Scholar", "Administrator", "Diligent"]
            ),
            HistoricalNationSpec(
                id: "silla", name: "新罗", shortName: "罗", color: "#4CA8DE",
                culture: "korean", religion: "buddhism", polity: "Kingdom", style: "absolute",
                capitalLon: 129.2, capitalLat: 35.8, capitalName: "金城",
                anchors: [
                    HistoricalAnchor(lon: 127.0, lat: 37.5, provinceName: "汉山州", weight: 1.15),
                    HistoricalAnchor(lon: 125.8, lat: 39.0, provinceName: "平壤", weight: 1.1),
                    HistoricalAnchor(lon: 127.1, lat: 35.8, provinceName: "完山州", weight: 1.1),
                    HistoricalAnchor(lon: 130.6, lat: 32.8, provinceName: "筑紫", weight: 1.2),
                ],
                rulerName: "金宪英", rulerTitle: "景德王",
                rulerMilitary: 68, rulerAdmin: 78, rulerDiplo: 80, rulerCharisma: 76,
                rulerTraits: ["Scholar", "Merciful"]
            ),
            HistoricalNationSpec(
                id: "abbasid", name: "黑衣大食东疆", shortName: "大食", color: "#2F3B47",
                culture: "arab", religion: "islam", polity: "Theocracy", style: "caliphate",
                capitalLon: 75.9, capitalLat: 39.5, capitalName: "喀什噶尔",
                anchors: [
                    HistoricalAnchor(lon: 74.8, lat: 39.9, provinceName: "疏勒", weight: 1.1),
                    HistoricalAnchor(lon: 77.2, lat: 37.8, provinceName: "葱岭", weight: 1.15),
                    HistoricalAnchor(lon: 78.2, lat: 42.5, provinceName: "碎叶", weight: 1.25),
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
        tags: ["大唐", "丝绸之路", "盛世", "中国"]
    )

    // 剧本 4：日本战国 · 桶狭间（公元 1560 年 · 永禄三年）
    private static let sengoku1560 = HistoricalScenario(
        id: "sengoku_1560",
        title: "日本战国 · 桶狭间",
        subtitle: "下克上 · 群雄上洛",
        region: .eastAsiaJapan,
        year: 1560,
        eraName: "永禄三年",
        description: "永禄三年五月，东海道第一弓取今川义元统率大军上洛，织田信长于尾张清洲孤注一掷奇袭桶狭间。甲斐武田与越后上杉激战川中岛，关东北条、中国毛利、畿内三好、九州岛津群雄并起，大明与朝鲜隔海相望。",
        author: "列国纪官方",
        isOfficial: true,
        provinceCount: 105,
        nations: [
            HistoricalNationSpec(
                id: "oda", name: "织田家", shortName: "织田", color: "#C6444B",
                culture: "japanese", religion: "shinto", polity: "Kingdom", style: "feudal",
                capitalLon: 136.8, capitalLat: 35.2, capitalName: "清洲",
                anchors: [
                    HistoricalAnchor(lon: 136.9, lat: 35.1, provinceName: "尾张", weight: 0.9),
                    HistoricalAnchor(lon: 136.7, lat: 35.5, provinceName: "美浓", weight: 0.8),
                ],
                rulerName: "织田信长", rulerTitle: "上总介",
                rulerMilitary: 95, rulerAdmin: 92, rulerDiplo: 84, rulerCharisma: 94,
                rulerTraits: ["Genius", "Unifier", "Visionary", "Conqueror"]
            ),
            HistoricalNationSpec(
                id: "imagawa", name: "今川家", shortName: "今川", color: "#8E44AD",
                culture: "japanese", religion: "buddhism", polity: "Kingdom", style: "feudal",
                capitalLon: 138.4, capitalLat: 35.0, capitalName: "骏府",
                anchors: [
                    HistoricalAnchor(lon: 137.8, lat: 35.0, provinceName: "远江", weight: 0.85),
                    HistoricalAnchor(lon: 137.3, lat: 34.9, provinceName: "三河", weight: 0.8),
                ],
                rulerName: "今川义元", rulerTitle: "治部大辅",
                rulerMilitary: 80, rulerAdmin: 86, rulerDiplo: 84, rulerCharisma: 82,
                rulerTraits: ["Administrator", "Diplomatic", "Financier"]
            ),
            HistoricalNationSpec(
                id: "takeda", name: "武田家", shortName: "武田", color: "#A93226",
                culture: "japanese", religion: "buddhism", polity: "Kingdom", style: "feudal",
                capitalLon: 138.6, capitalLat: 35.7, capitalName: "甲府",
                anchors: [
                    HistoricalAnchor(lon: 138.5, lat: 35.6, provinceName: "甲斐", weight: 0.9),
                    HistoricalAnchor(lon: 138.0, lat: 36.2, provinceName: "信浓", weight: 1.0),
                ],
                rulerName: "武田信玄", rulerTitle: "甲斐守",
                rulerMilitary: 96, rulerAdmin: 88, rulerDiplo: 86, rulerCharisma: 90,
                rulerTraits: ["Strategist", "Tactician", "Lawgiver"]
            ),
            HistoricalNationSpec(
                id: "uesugi", name: "上杉家", shortName: "上杉", color: "#2980B9",
                culture: "japanese", religion: "buddhism", polity: "Kingdom", style: "feudal",
                capitalLon: 138.2, capitalLat: 37.1, capitalName: "春日山",
                anchors: [
                    HistoricalAnchor(lon: 139.2, lat: 37.6, provinceName: "越后", weight: 1.05),
                    HistoricalAnchor(lon: 137.2, lat: 36.7, provinceName: "越中", weight: 0.9),
                ],
                rulerName: "上杉谦信", rulerTitle: "关东管领",
                rulerMilitary: 98, rulerAdmin: 76, rulerDiplo: 72, rulerCharisma: 88,
                rulerTraits: ["Brave", "Just", "Tactician", "BattleHardened"]
            ),
            HistoricalNationSpec(
                id: "hojo", name: "北条家", shortName: "北条", color: "#1F618D",
                culture: "japanese", religion: "shinto", polity: "Kingdom", style: "feudal",
                capitalLon: 139.2, capitalLat: 35.3, capitalName: "小田原",
                anchors: [
                    HistoricalAnchor(lon: 139.6, lat: 35.7, provinceName: "武藏", weight: 1.05),
                    HistoricalAnchor(lon: 139.0, lat: 35.0, provinceName: "伊豆", weight: 0.85),
                    HistoricalAnchor(lon: 140.2, lat: 35.9, provinceName: "下总", weight: 1.0),
                    HistoricalAnchor(lon: 139.2, lat: 36.4, provinceName: "上野", weight: 0.95),
                ],
                rulerName: "北条氏康", rulerTitle: "相模守",
                rulerMilitary: 88, rulerAdmin: 92, rulerDiplo: 84, rulerCharisma: 86,
                rulerTraits: ["Administrator", "Diligent", "Veteran"]
            ),
            HistoricalNationSpec(
                id: "mori", name: "毛利家", shortName: "毛利", color: "#27AE60",
                culture: "japanese", religion: "shinto", polity: "Kingdom", style: "feudal",
                capitalLon: 132.7, capitalLat: 34.7, capitalName: "吉田郡山",
                anchors: [
                    HistoricalAnchor(lon: 132.5, lat: 34.4, provinceName: "安艺", weight: 0.95),
                    HistoricalAnchor(lon: 131.6, lat: 34.1, provinceName: "周防", weight: 0.95),
                    HistoricalAnchor(lon: 131.0, lat: 34.2, provinceName: "长门", weight: 0.95),
                    HistoricalAnchor(lon: 133.1, lat: 35.4, provinceName: "出云", weight: 1.0),
                    HistoricalAnchor(lon: 133.9, lat: 34.8, provinceName: "备前", weight: 0.9),
                ],
                rulerName: "毛利元就", rulerTitle: "陆奥守",
                rulerMilitary: 90, rulerAdmin: 88, rulerDiplo: 94, rulerCharisma: 88,
                rulerTraits: ["Strategist", "MasterDiplomat", "Patient"]
            ),
            HistoricalNationSpec(
                id: "miyoshi", name: "三好家", shortName: "三好", color: "#D68910",
                culture: "japanese", religion: "buddhism", polity: "Empire", style: "shogunate",
                capitalLon: 135.5, capitalLat: 34.6, capitalName: "堺",
                anchors: [
                    HistoricalAnchor(lon: 135.8, lat: 35.0, provinceName: "京都", weight: 0.95),
                    HistoricalAnchor(lon: 134.6, lat: 34.1, provinceName: "阿波", weight: 0.9),
                    HistoricalAnchor(lon: 134.7, lat: 34.8, provinceName: "播磨", weight: 0.9),
                    HistoricalAnchor(lon: 135.6, lat: 33.9, provinceName: "纪伊", weight: 0.95),
                ],
                rulerName: "三好长庆", rulerTitle: "修理大夫",
                rulerMilitary: 84, rulerAdmin: 86, rulerDiplo: 82, rulerCharisma: 84,
                rulerTraits: ["Administrator", "Visionary"]
            ),
            HistoricalNationSpec(
                id: "shimazu", name: "岛津家", shortName: "岛津", color: "#34495E",
                culture: "japanese", religion: "shinto", polity: "Kingdom", style: "feudal",
                capitalLon: 130.6, capitalLat: 31.6, capitalName: "鹿儿岛",
                anchors: [
                    HistoricalAnchor(lon: 130.4, lat: 31.9, provinceName: "萨摩", weight: 0.95),
                    HistoricalAnchor(lon: 131.0, lat: 31.5, provinceName: "大隅", weight: 0.9),
                    HistoricalAnchor(lon: 131.4, lat: 32.1, provinceName: "日向", weight: 0.9),
                    HistoricalAnchor(lon: 127.8, lat: 26.3, provinceName: "琉球", weight: 1.2),
                ],
                rulerName: "岛津贵久", rulerTitle: "陆奥守",
                rulerMilitary: 88, rulerAdmin: 80, rulerDiplo: 76, rulerCharisma: 84,
                rulerTraits: ["Brave", "BattleHardened", "Veteran"]
            ),
            HistoricalNationSpec(
                id: "otomo", name: "大友家", shortName: "大友", color: "#E67E22",
                culture: "japanese", religion: "catholic", polity: "Kingdom", style: "feudal",
                capitalLon: 131.6, capitalLat: 33.2, capitalName: "府内",
                anchors: [
                    HistoricalAnchor(lon: 131.4, lat: 33.0, provinceName: "丰后", weight: 0.9),
                    HistoricalAnchor(lon: 130.4, lat: 33.6, provinceName: "筑前", weight: 0.95),
                    HistoricalAnchor(lon: 130.0, lat: 33.1, provinceName: "肥前", weight: 0.95),
                ],
                rulerName: "大友宗麟", rulerTitle: "丰后守",
                rulerMilitary: 78, rulerAdmin: 80, rulerDiplo: 86, rulerCharisma: 80,
                rulerTraits: ["Diplomatic", "SeaVision"]
            ),
            HistoricalNationSpec(
                id: "date", name: "伊达家", shortName: "伊达", color: "#16A085",
                culture: "japanese", religion: "shinto", polity: "Kingdom", style: "feudal",
                capitalLon: 140.1, capitalLat: 37.9, capitalName: "米泽",
                anchors: [
                    HistoricalAnchor(lon: 140.9, lat: 38.3, provinceName: "陆奥", weight: 1.15),
                    HistoricalAnchor(lon: 140.1, lat: 39.7, provinceName: "出羽", weight: 1.15),
                    HistoricalAnchor(lon: 140.8, lat: 40.8, provinceName: "津轻", weight: 1.15),
                    HistoricalAnchor(lon: 142.5, lat: 43.2, provinceName: "虾夷", weight: 1.6),
                    HistoricalAnchor(lon: 142.6, lat: 48.0, provinceName: "桦太", weight: 1.45),
                ],
                rulerName: "伊达晴宗", rulerTitle: "左京大夫",
                rulerMilitary: 78, rulerAdmin: 74, rulerDiplo: 80, rulerCharisma: 76,
                rulerTraits: ["Ambitious", "Diplomatic"]
            ),
            HistoricalNationSpec(
                id: "chosokabe", name: "长宗我部家", shortName: "长宗", color: "#2E7D32",
                culture: "japanese", religion: "shinto", polity: "Kingdom", style: "feudal",
                capitalLon: 133.6, capitalLat: 33.6, capitalName: "冈丰",
                anchors: [
                    HistoricalAnchor(lon: 133.4, lat: 33.4, provinceName: "土佐", weight: 0.95),
                    HistoricalAnchor(lon: 132.8, lat: 33.7, provinceName: "伊予", weight: 0.9),
                ],
                rulerName: "长宗我部国亲", rulerTitle: "宫内少辅",
                rulerMilitary: 82, rulerAdmin: 78, rulerDiplo: 74, rulerCharisma: 80,
                rulerTraits: ["Brave", "Ambitious"]
            ),
            HistoricalNationSpec(
                id: "asakura", name: "朝仓家", shortName: "朝仓", color: "#6C3483",
                culture: "japanese", religion: "buddhism", polity: "Kingdom", style: "feudal",
                capitalLon: 136.3, capitalLat: 36.0, capitalName: "一乘谷",
                anchors: [
                    HistoricalAnchor(lon: 136.2, lat: 36.1, provinceName: "越前", weight: 0.9),
                    HistoricalAnchor(lon: 136.7, lat: 36.6, provinceName: "加贺", weight: 0.9),
                ],
                rulerName: "朝仓义景", rulerTitle: "左卫门督",
                rulerMilitary: 62, rulerAdmin: 74, rulerDiplo: 70, rulerCharisma: 72,
                rulerTraits: ["Scholar", "Patient"]
            ),
            HistoricalNationSpec(
                id: "ming", name: "大明", shortName: "明", color: "#D49B2A",
                culture: "chinese", religion: "confucian", polity: "Empire", style: "dynasty",
                capitalLon: 116.4, capitalLat: 39.9, capitalName: "北京",
                anchors: [
                    HistoricalAnchor(lon: 118.8, lat: 32.1, provinceName: "南京", weight: 1.55),
                    HistoricalAnchor(lon: 123.4, lat: 41.8, provinceName: "辽东", weight: 1.45),
                    HistoricalAnchor(lon: 120.2, lat: 30.3, provinceName: "浙江", weight: 1.4),
                    HistoricalAnchor(lon: 119.3, lat: 26.1, provinceName: "福建", weight: 1.45),
                    HistoricalAnchor(lon: 113.3, lat: 23.1, provinceName: "广东", weight: 1.6),
                    HistoricalAnchor(lon: 108.9, lat: 34.3, provinceName: "陕西", weight: 1.75),
                    HistoricalAnchor(lon: 104.1, lat: 30.7, provinceName: "四川", weight: 1.8),
                    HistoricalAnchor(lon: 114.3, lat: 30.6, provinceName: "湖广", weight: 1.6),
                    HistoricalAnchor(lon: 102.7, lat: 25.0, provinceName: "云南", weight: 1.85),
                    HistoricalAnchor(lon: 128.0, lat: 46.5, provinceName: "奴儿干", weight: 1.75),
                    HistoricalAnchor(lon: 121.0, lat: 23.8, provinceName: "大员", weight: 1.35),
                    HistoricalAnchor(lon: 121.0, lat: 18.4, provinceName: "吕宋", weight: 1.35),
                    HistoricalAnchor(lon: 105.8, lat: 20.5, provinceName: "安南", weight: 1.65),
                    HistoricalAnchor(lon: 97.5, lat: 20.5, provinceName: "滇缅边", weight: 1.75),
                ],
                rulerName: "朱厚熜", rulerTitle: "嘉靖帝",
                rulerMilitary: 68, rulerAdmin: 82, rulerDiplo: 76, rulerCharisma: 78,
                rulerTraits: ["IronFist", "Stubborn"]
            ),
            HistoricalNationSpec(
                id: "joseon", name: "朝鲜", shortName: "鲜", color: "#4285C4",
                culture: "korean", religion: "confucian", polity: "Kingdom", style: "absolute",
                capitalLon: 127.0, capitalLat: 37.6, capitalName: "汉城",
                anchors: [
                    HistoricalAnchor(lon: 129.0, lat: 35.2, provinceName: "釜山", weight: 1.05),
                    HistoricalAnchor(lon: 125.8, lat: 39.0, provinceName: "平壤", weight: 1.1),
                    HistoricalAnchor(lon: 127.5, lat: 40.3, provinceName: "咸兴", weight: 1.1),
                    HistoricalAnchor(lon: 127.1, lat: 35.8, provinceName: "全州", weight: 1.0),
                ],
                rulerName: "李峘", rulerTitle: "朝鲜明宗",
                rulerMilitary: 64, rulerAdmin: 76, rulerDiplo: 78, rulerCharisma: 74,
                rulerTraits: ["Scholar", "Patient"]
            ),
        ],
        openingWars: [
            HistoricalWarSpec(attackerId: "imagawa", defenderId: "oda", casusBelli: "桶狭间合战 · 尾张上洛战"),
            HistoricalWarSpec(attackerId: "takeda", defenderId: "uesugi", casusBelli: "川中岛合战 · 信浓争锋"),
        ],
        openingAlliances: [
            HistoricalAllianceSpec(name: "甲相骏三国同盟", memberIds: ["takeda", "hojo", "imagawa"]),
        ],
        tags: ["日本战国", "桶狭间", "东亚", "群雄割据"]
    )

    // 剧本 5：拿破仑欧陆 · 远征莫斯科（公元 1812 年）
    private static let napoleon1812 = HistoricalScenario(
        id: "napoleon_1812",
        title: "拿破仑欧陆 · 远征莫斯科",
        subtitle: "法兰西帝国巅峰 · 大军东征",
        region: .europe,
        year: 1812,
        eraName: "法兰西第一帝国",
        description: "1812年夏，拿破仑率六十万大军强渡涅曼河远征莫斯科。法兰西帝国及其莱茵邦联、华沙大公国与意大利诸邦雄踞欧陆，大英帝国以制海权与西班牙半岛战线牵制法军，俄、奥、普、奥斯曼与北欧诸王各自博弈。",
        author: "列国纪官方",
        isOfficial: true,
        provinceCount: 145,
        nations: [
            HistoricalNationSpec(
                id: "france", name: "法兰西帝国", shortName: "法", color: "#2557A7",
                culture: "french", religion: "catholic", polity: "Empire", style: "empire",
                capitalLon: 2.3, capitalLat: 48.9, capitalName: "巴黎",
                anchors: [
                    HistoricalAnchor(lon: 4.8, lat: 45.8, provinceName: "里昂", weight: 1.25),
                    HistoricalAnchor(lon: 5.4, lat: 43.8, provinceName: "马赛", weight: 1.2),
                    HistoricalAnchor(lon: -0.6, lat: 44.8, provinceName: "波尔多", weight: 1.25),
                    HistoricalAnchor(lon: 4.4, lat: 50.8, provinceName: "布鲁塞尔", weight: 1.15),
                    HistoricalAnchor(lon: 4.9, lat: 52.4, provinceName: "阿姆斯特丹", weight: 1.15),
                    HistoricalAnchor(lon: 8.7, lat: 50.1, provinceName: "法兰克福", weight: 1.2),
                    HistoricalAnchor(lon: 11.6, lat: 48.1, provinceName: "慕尼黑", weight: 1.1),
                    HistoricalAnchor(lon: 9.2, lat: 45.5, provinceName: "米兰", weight: 1.2),
                    HistoricalAnchor(lon: 12.5, lat: 41.9, provinceName: "罗马", weight: 1.25),
                    HistoricalAnchor(lon: 14.3, lat: 40.8, provinceName: "那不勒斯", weight: 1.2),
                    HistoricalAnchor(lon: 21.0, lat: 52.2, provinceName: "华沙", weight: 1.2),
                    HistoricalAnchor(lon: 9.0, lat: 42.2, provinceName: "科西嘉", weight: 1.1),
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
                    HistoricalAnchor(lon: 25.0, lat: 60.8, provinceName: "赫尔辛基", weight: 1.35),
                    HistoricalAnchor(lon: 24.1, lat: 56.9, provinceName: "里加", weight: 1.15),
                    HistoricalAnchor(lon: 42.0, lat: 47.2, provinceName: "顿河罗斯托夫", weight: 1.5),
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
                    HistoricalAnchor(lon: 14.0, lat: 37.5, provinceName: "巴勒莫", weight: 1.15),
                    HistoricalAnchor(lon: 9.0, lat: 40.0, provinceName: "卡利亚里", weight: 1.1),
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
                    HistoricalAnchor(lon: 12.1, lat: 45.7, provinceName: "威尼斯", weight: 1.0),
                    HistoricalAnchor(lon: 24.0, lat: 46.8, provinceName: "特兰西瓦尼亚", weight: 1.15),
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
                    HistoricalAnchor(lon: 1.8, lat: 41.7, provinceName: "巴塞罗那", weight: 1.1),
                    HistoricalAnchor(lon: -0.4, lat: 39.5, provinceName: "瓦伦西亚", weight: 1.1),
                    HistoricalAnchor(lon: -5.8, lat: 43.0, provinceName: "莱昂", weight: 1.15),
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
                    HistoricalAnchor(lon: -8.0, lat: 37.2, provinceName: "法鲁", weight: 0.85),
                ],
                rulerName: "若昂六世", rulerTitle: "摄政王",
                rulerMilitary: 62, rulerAdmin: 72, rulerDiplo: 78, rulerCharisma: 70,
                rulerTraits: ["SeaVision", "Diplomatic"]
            ),
            HistoricalNationSpec(
                id: "ottoman", name: "奥斯曼帝国", shortName: "奥斯曼", color: "#196F3D",
                culture: "turkic", religion: "islam", polity: "Kingdom", style: "sultanate",
                capitalLon: 28.4, capitalLat: 41.4, capitalName: "君士坦丁堡",
                anchors: [
                    HistoricalAnchor(lon: 23.3, lat: 42.7, provinceName: "索菲亚", weight: 1.2),
                    HistoricalAnchor(lon: 23.7, lat: 38.0, provinceName: "雅典", weight: 1.25),
                    HistoricalAnchor(lon: 20.5, lat: 44.8, provinceName: "贝尔格莱德", weight: 1.15),
                    HistoricalAnchor(lon: 32.9, lat: 39.9, provinceName: "安卡拉", weight: 1.45),
                    HistoricalAnchor(lon: 27.1, lat: 38.4, provinceName: "伊兹密尔", weight: 1.25),
                    HistoricalAnchor(lon: 39.7, lat: 40.9, provinceName: "特拉布宗", weight: 1.35),
                    HistoricalAnchor(lon: 25.0, lat: 35.3, provinceName: "克里特", weight: 1.15),
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
                capitalLon: 11.9, capitalLat: 55.6, capitalName: "哥本哈根",
                anchors: [
                    HistoricalAnchor(lon: 10.7, lat: 59.9, provinceName: "奥斯陆", weight: 1.25),
                    HistoricalAnchor(lon: 5.3, lat: 60.4, provinceName: "卑尔根", weight: 1.2),
                    HistoricalAnchor(lon: 10.4, lat: 63.4, provinceName: "特隆赫姆", weight: 1.3),
                    HistoricalAnchor(lon: -21.9, lat: 64.1, provinceName: "雷克雅未克", weight: 1.5),
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
        tags: ["拿破仑", "欧洲", "近代", "列强"]
    )

    // 剧本 6：第一次世界大战 · 八月炮火（公元 1914 年 · 全球格局）
    private static let ww1_1914 = HistoricalScenario(
        id: "ww1_1914",
        title: "第一次世界大战 · 八月炮火",
        subtitle: "同盟国 vs 协约国 · 全球殖民帝国",
        region: .world,
        year: 1914,
        eraName: "一战风云",
        description: "1914年八月，萨拉热窝枪声引爆全球大战。德意志、奥匈与奥斯曼组成同盟国，对抗横跨五大洲的英、法、俄协约国；大洋彼岸的美利坚、远东的大日本帝国与中华民国亦被卷入时代漩涡。",
        author: "列国纪官方",
        isOfficial: true,
        provinceCount: 190,
        nations: [
            HistoricalNationSpec(
                id: "germany", name: "德意志帝国", shortName: "德", color: "#4A5568",
                culture: "german", religion: "protestant", polity: "Empire", style: "dualMonarchy",
                capitalLon: 13.4, capitalLat: 52.5, capitalName: "柏林",
                anchors: [
                    HistoricalAnchor(lon: 11.6, lat: 48.1, provinceName: "慕尼黑", weight: 1.0),
                    HistoricalAnchor(lon: 9.9, lat: 53.5, provinceName: "汉堡", weight: 1.0),
                    HistoricalAnchor(lon: 19.5, lat: 54.0, provinceName: "东普鲁士", weight: 1.0),
                    HistoricalAnchor(lon: 12.5, lat: 5.0, provinceName: "德属喀麦隆", weight: 1.15),
                    HistoricalAnchor(lon: 35.0, lat: -6.5, provinceName: "德属东非", weight: 1.2),
                    HistoricalAnchor(lon: 17.0, lat: -22.5, provinceName: "德属西南非", weight: 1.25),
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
                    HistoricalAnchor(lon: 19.0, lat: 47.5, provinceName: "布达佩斯", weight: 1.05),
                    HistoricalAnchor(lon: 18.4, lat: 43.9, provinceName: "萨拉热窝", weight: 1.0),
                ],
                rulerName: "弗朗茨·约瑟夫", rulerTitle: "皇帝",
                rulerMilitary: 72, rulerAdmin: 76, rulerDiplo: 74, rulerCharisma: 78,
                rulerTraits: ["Patient", "Just"]
            ),
            HistoricalNationSpec(
                id: "ottoman", name: "奥斯曼帝国", shortName: "奥斯曼", color: "#1B7A43",
                culture: "turkic", religion: "islam", polity: "Kingdom", style: "sultanate",
                capitalLon: 28.4, capitalLat: 41.4, capitalName: "君士坦丁堡",
                anchors: [
                    HistoricalAnchor(lon: 35.0, lat: 39.0, provinceName: "安卡拉", weight: 1.25),
                    HistoricalAnchor(lon: 36.3, lat: 33.5, provinceName: "大马士革", weight: 1.2),
                    HistoricalAnchor(lon: 44.4, lat: 33.3, provinceName: "巴格达", weight: 1.4),
                    HistoricalAnchor(lon: 41.0, lat: 22.0, provinceName: "希贾兹", weight: 1.45),
                    HistoricalAnchor(lon: 53.0, lat: 32.0, provinceName: "波斯高原", weight: 1.45),
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
                    HistoricalAnchor(lon: -3.2, lat: 55.9, provinceName: "爱丁堡", weight: 1.1),
                    HistoricalAnchor(lon: -75.7, lat: 45.4, provinceName: "渥太华", weight: 1.7),
                    HistoricalAnchor(lon: -105.0, lat: 55.0, provinceName: "加拿大西部", weight: 2.1),
                    HistoricalAnchor(lon: -42.0, lat: 67.0, provinceName: "格陵兰", weight: 1.8),
                    HistoricalAnchor(lon: 31.2, lat: 30.0, provinceName: "开罗", weight: 1.45),
                    HistoricalAnchor(lon: 32.5, lat: 15.6, provinceName: "喀土穆", weight: 1.4),
                    HistoricalAnchor(lon: 24.0, lat: -29.0, provinceName: "开普敦", weight: 1.65),
                    HistoricalAnchor(lon: 77.2, lat: 28.6, provinceName: "德里", weight: 1.7),
                    HistoricalAnchor(lon: 78.0, lat: 14.0, provinceName: "马德拉斯", weight: 1.5),
                    HistoricalAnchor(lon: 96.2, lat: 17.0, provinceName: "仰光", weight: 1.35),
                    HistoricalAnchor(lon: 103.8, lat: 1.4, provinceName: "新加坡", weight: 1.65),
                    HistoricalAnchor(lon: 114.0, lat: -2.0, provinceName: "南洋群岛", weight: 1.65),
                    HistoricalAnchor(lon: 149.8, lat: -33.6, provinceName: "悉尼", weight: 1.9),
                    HistoricalAnchor(lon: 122.0, lat: -25.0, provinceName: "珀斯", weight: 1.9),
                    HistoricalAnchor(lon: 173.2, lat: -41.0, provinceName: "惠灵顿", weight: 1.6),
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
                    HistoricalAnchor(lon: 5.4, lat: 43.3, provinceName: "马赛", weight: 1.05),
                    HistoricalAnchor(lon: 3.0, lat: 36.7, provinceName: "阿尔及尔", weight: 1.35),
                    HistoricalAnchor(lon: -5.0, lat: 18.0, provinceName: "法属西非", weight: 1.85),
                    HistoricalAnchor(lon: 16.0, lat: 12.0, provinceName: "法属赤道非洲", weight: 1.6),
                    HistoricalAnchor(lon: 47.0, lat: -19.0, provinceName: "马达加斯加", weight: 1.45),
                    HistoricalAnchor(lon: 106.7, lat: 15.0, provinceName: "印度支那", weight: 1.35),
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
                    HistoricalAnchor(lon: 37.6, lat: 55.8, provinceName: "莫斯科", weight: 1.65),
                    HistoricalAnchor(lon: 30.5, lat: 50.4, provinceName: "基辅", weight: 1.4),
                    HistoricalAnchor(lon: 60.6, lat: 56.8, provinceName: "叶卡捷琳堡", weight: 1.85),
                    HistoricalAnchor(lon: 82.9, lat: 55.0, provinceName: "新西伯利亚", weight: 2.0),
                    HistoricalAnchor(lon: 104.3, lat: 52.3, provinceName: "伊尔库茨克", weight: 2.0),
                    HistoricalAnchor(lon: 131.9, lat: 43.1, provinceName: "海参崴", weight: 1.75),
                    HistoricalAnchor(lon: 155.0, lat: 62.0, provinceName: "堪察加", weight: 2.0),
                    HistoricalAnchor(lon: 69.2, lat: 41.3, provinceName: "塔什干", weight: 1.65),
                ],
                rulerName: "尼古拉二世", rulerTitle: "沙皇",
                rulerMilitary: 68, rulerAdmin: 64, rulerDiplo: 72, rulerCharisma: 74,
                rulerTraits: ["Stubborn", "Just"]
            ),
            HistoricalNationSpec(
                id: "usa", name: "美利坚合众国", shortName: "美", color: "#3B82C4",
                culture: "english", religion: "protestant", polity: "Federation", style: "federal",
                capitalLon: -77.0, capitalLat: 38.9, capitalName: "华盛顿",
                anchors: [
                    HistoricalAnchor(lon: -74.0, lat: 40.7, provinceName: "纽约", weight: 1.35),
                    HistoricalAnchor(lon: -87.6, lat: 41.9, provinceName: "芝加哥", weight: 1.55),
                    HistoricalAnchor(lon: -96.8, lat: 32.8, provinceName: "达拉斯", weight: 1.55),
                    HistoricalAnchor(lon: -120.8, lat: 37.8, provinceName: "旧金山", weight: 1.65),
                    HistoricalAnchor(lon: -150.0, lat: 64.0, provinceName: "阿拉斯加", weight: 1.75),
                    HistoricalAnchor(lon: 121.0, lat: 14.6, provinceName: "马尼拉", weight: 1.3),
                    HistoricalAnchor(lon: -80.0, lat: 22.0, provinceName: "哈瓦那", weight: 1.2),
                ],
                rulerName: "伍德罗·威尔逊", rulerTitle: "总统",
                rulerMilitary: 74, rulerAdmin: 88, rulerDiplo: 92, rulerCharisma: 86,
                rulerTraits: ["Scholar", "MasterDiplomat", "Visionary"]
            ),
            HistoricalNationSpec(
                id: "japan", name: "大日本帝国", shortName: "日", color: "#B83227",
                culture: "japanese", religion: "shinto", polity: "Empire", style: "dualMonarchy",
                capitalLon: 139.7, capitalLat: 35.7, capitalName: "东京",
                anchors: [
                    HistoricalAnchor(lon: 135.5, lat: 34.7, provinceName: "大阪", weight: 1.15),
                    HistoricalAnchor(lon: 141.3, lat: 43.1, provinceName: "札幌", weight: 1.15),
                    HistoricalAnchor(lon: 127.0, lat: 37.6, provinceName: "京城", weight: 1.15),
                    HistoricalAnchor(lon: 121.5, lat: 25.0, provinceName: "台北", weight: 1.05),
                ],
                rulerName: "大正天皇", rulerTitle: "天皇",
                rulerMilitary: 80, rulerAdmin: 82, rulerDiplo: 78, rulerCharisma: 82,
                rulerTraits: ["NavalMastery", "Reformer"]
            ),
            HistoricalNationSpec(
                id: "china", name: "中华民国", shortName: "华", color: "#D99B26",
                culture: "chinese", religion: "confucian", polity: "Republic", style: "presidential",
                capitalLon: 116.4, capitalLat: 39.9, capitalName: "北京",
                anchors: [
                    HistoricalAnchor(lon: 121.5, lat: 31.2, provinceName: "上海", weight: 1.35),
                    HistoricalAnchor(lon: 113.3, lat: 23.1, provinceName: "广州", weight: 1.35),
                    HistoricalAnchor(lon: 104.1, lat: 30.7, provinceName: "成都", weight: 1.45),
                    HistoricalAnchor(lon: 87.6, lat: 43.8, provinceName: "迪化", weight: 1.65),
                    HistoricalAnchor(lon: 91.1, lat: 29.7, provinceName: "拉萨", weight: 1.5),
                    HistoricalAnchor(lon: 123.4, lat: 41.8, provinceName: "奉天", weight: 1.3),
                    HistoricalAnchor(lon: 106.9, lat: 47.9, provinceName: "库伦", weight: 1.4),
                ],
                rulerName: "袁世凯", rulerTitle: "大总统",
                rulerMilitary: 80, rulerAdmin: 76, rulerDiplo: 74, rulerCharisma: 76,
                rulerTraits: ["Ambitious", "IronFist"]
            ),
            HistoricalNationSpec(
                id: "italy", name: "意大利王国", shortName: "意", color: "#3E8E41",
                culture: "italian", religion: "catholic", polity: "Kingdom", style: "constitutional",
                capitalLon: 12.5, capitalLat: 41.9, capitalName: "罗马",
                anchors: [
                    HistoricalAnchor(lon: 9.2, lat: 45.5, provinceName: "米兰", weight: 1.0),
                    HistoricalAnchor(lon: 17.0, lat: 27.0, provinceName: "的黎波里", weight: 1.35),
                    HistoricalAnchor(lon: 45.3, lat: 5.0, provinceName: "意属索马里", weight: 1.25),
                ],
                rulerName: "维托里奥·埃马努埃莱三世", rulerTitle: "国王",
                rulerMilitary: 70, rulerAdmin: 74, rulerDiplo: 78, rulerCharisma: 74,
                rulerTraits: ["Diplomatic", "Patient"]
            ),
            HistoricalNationSpec(
                id: "spain", name: "西班牙王国", shortName: "西", color: "#E2B13C",
                culture: "spanish", religion: "catholic", polity: "Kingdom", style: "constitutional",
                capitalLon: -3.7, capitalLat: 40.4, capitalName: "马德里",
                anchors: [
                    HistoricalAnchor(lon: -8.2, lat: 38.9, provinceName: "里斯本", weight: 1.05),
                    HistoricalAnchor(lon: 15.0, lat: 62.0, provinceName: "北欧中立区", weight: 1.4),
                ],
                rulerName: "阿方索十三世", rulerTitle: "国王",
                rulerMilitary: 66, rulerAdmin: 72, rulerDiplo: 78, rulerCharisma: 76,
                rulerTraits: ["Dovish", "Diplomatic"]
            ),
            HistoricalNationSpec(
                id: "brazil", name: "巴西联邦共和国", shortName: "巴", color: "#229954",
                culture: "portuguese", religion: "catholic", polity: "Federation", style: "federal",
                capitalLon: -43.2, capitalLat: -22.9, capitalName: "里约热内卢",
                anchors: [
                    HistoricalAnchor(lon: -60.0, lat: -3.1, provinceName: "马瑙斯", weight: 1.8),
                    HistoricalAnchor(lon: -38.5, lat: -12.9, provinceName: "萨尔瓦多", weight: 1.65),
                    HistoricalAnchor(lon: -74.0, lat: 4.6, provinceName: "波哥大", weight: 1.55),
                    HistoricalAnchor(lon: -77.0, lat: -12.0, provinceName: "利马", weight: 1.5),
                ],
                rulerName: "赫尔梅斯·达·丰塞卡", rulerTitle: "总统",
                rulerMilitary: 70, rulerAdmin: 72, rulerDiplo: 76, rulerCharisma: 74,
                rulerTraits: ["Administrator", "Just"]
            ),
            HistoricalNationSpec(
                id: "argentina", name: "阿根廷共和国", shortName: "阿", color: "#5DADE2",
                culture: "spanish", religion: "catholic", polity: "Republic", style: "presidential",
                capitalLon: -58.4, capitalLat: -34.6, capitalName: "布宜诺斯艾利斯",
                anchors: [
                    HistoricalAnchor(lon: -70.7, lat: -33.4, provinceName: "圣地亚哥", weight: 1.45),
                    HistoricalAnchor(lon: -68.0, lat: -46.0, provinceName: "巴塔哥尼亚", weight: 1.6),
                    HistoricalAnchor(lon: -68.1, lat: -16.5, provinceName: "拉巴斯", weight: 1.35),
                ],
                rulerName: "维克托里诺·德·拉·普拉萨", rulerTitle: "总统",
                rulerMilitary: 66, rulerAdmin: 78, rulerDiplo: 78, rulerCharisma: 74,
                rulerTraits: ["Financier", "Dovish"]
            ),
            HistoricalNationSpec(
                id: "mexico", name: "墨西哥合众国", shortName: "墨", color: "#1E8449",
                culture: "spanish", religion: "catholic", polity: "Republic", style: "presidential",
                capitalLon: -99.1, capitalLat: 19.4, capitalName: "墨西哥城",
                anchors: [
                    HistoricalAnchor(lon: -103.3, lat: 25.5, provinceName: "蒙特雷", weight: 1.35),
                    HistoricalAnchor(lon: -86.0, lat: 13.0, provinceName: "中美洲", weight: 1.35),
                ],
                rulerName: "贝努斯蒂亚诺·卡兰萨", rulerTitle: "总统",
                rulerMilitary: 74, rulerAdmin: 74, rulerDiplo: 72, rulerCharisma: 76,
                rulerTraits: ["Reformer", "BattleHardened"]
            ),
        ],
        openingWars: [
            HistoricalWarSpec(attackerId: "germany", defenderId: "france", casusBelli: "施里芬计划 · 西线决战"),
            HistoricalWarSpec(attackerId: "germany", defenderId: "russia", casusBelli: "八月炮火 · 东线宣战"),
            HistoricalWarSpec(attackerId: "austria_hungary", defenderId: "russia", casusBelli: "七月危机 · 巴尔干战火"),
            HistoricalWarSpec(attackerId: "germany", defenderId: "britain", casusBelli: "比利时中立遭破坏"),
        ],
        openingAlliances: [
            HistoricalAllianceSpec(name: "同盟国", memberIds: ["germany", "austria_hungary", "ottoman"]),
            HistoricalAllianceSpec(name: "协约国", memberIds: ["britain", "france", "russia"]),
        ],
        tags: ["一战", "世界全图", "全球大战", "近代"]
    )

    // 剧本 7：二战欧洲战场 · 欧陆烽烟（公元 1939 年 9 月）
    private static let ww2Europe1939 = HistoricalScenario(
        id: "ww2_europe_1939",
        title: "二战欧洲战场 · 欧陆烽烟",
        subtitle: "1939年9月 · 闪电战降临",
        region: .europe,
        year: 1939,
        eraName: "二战欧洲",
        description: "1939年9月1日，德军闪击波兰，英法对德宣战，第二次世界大战欧洲战场全面爆发。欧陆十六国政体光谱分明——纳粹极权、法西斯、苏维埃、议会民主与君主立宪在战火中激烈碰撞。",
        author: "列国纪官方",
        isOfficial: true,
        provinceCount: 155,
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
                    HistoricalAnchor(lon: 24.1, lat: 56.9, provinceName: "里加", weight: 1.1),
                    HistoricalAnchor(lon: 46.0, lat: 61.0, provinceName: "阿尔汉格尔斯克", weight: 1.6),
                ],
                rulerName: "约瑟夫·斯大林", rulerTitle: "总书记",
                rulerMilitary: 86, rulerAdmin: 88, rulerDiplo: 80, rulerCharisma: 84,
                rulerTraits: ["IronFist", "Paranoid", "BattleHardened"]
            ),
            HistoricalNationSpec(
                id: "uk", name: "大不列颠王国", shortName: "英", color: "#D34848",
                culture: "english", religion: "protestant", polity: "Kingdom", style: "constitutional",
                capitalLon: -0.1, capitalLat: 51.5, capitalName: "伦敦",
                anchors: [
                    HistoricalAnchor(lon: -3.2, lat: 55.9, provinceName: "爱丁堡", weight: 1.25),
                    HistoricalAnchor(lon: -2.2, lat: 53.5, provinceName: "曼彻斯特", weight: 1.15),
                    HistoricalAnchor(lon: -6.3, lat: 53.3, provinceName: "都柏林", weight: 1.25),
                    HistoricalAnchor(lon: 33.4, lat: 35.1, provinceName: "塞浦路斯", weight: 1.1),
                ],
                rulerName: "温斯顿·丘吉尔", rulerTitle: "首相",
                rulerMilitary: 86, rulerAdmin: 84, rulerDiplo: 92, rulerCharisma: 94,
                rulerTraits: ["Charismatic", "NavalMastery", "SeaVision", "NaturalLeader"]
            ),
            HistoricalNationSpec(
                id: "france", name: "法兰西第三共和国", shortName: "法", color: "#265DA6",
                culture: "french", religion: "catholic", polity: "Republic", style: "parliamentary",
                capitalLon: 2.3, capitalLat: 48.9, capitalName: "巴黎",
                anchors: [
                    HistoricalAnchor(lon: 4.8, lat: 45.8, provinceName: "里昂", weight: 1.15),
                    HistoricalAnchor(lon: 5.4, lat: 43.8, provinceName: "马赛", weight: 1.15),
                    HistoricalAnchor(lon: -0.6, lat: 44.8, provinceName: "波尔多", weight: 1.2),
                    HistoricalAnchor(lon: 7.7, lat: 48.6, provinceName: "斯特拉斯堡", weight: 0.95),
                    HistoricalAnchor(lon: 9.0, lat: 42.2, provinceName: "科西嘉", weight: 1.05),
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
                    HistoricalAnchor(lon: 25.3, lat: 54.7, provinceName: "维尔纽斯", weight: 1.0),
                ],
                rulerName: "爱德华·希米格维", rulerTitle: "元帅",
                rulerMilitary: 76, rulerAdmin: 68, rulerDiplo: 70, rulerCharisma: 76,
                rulerTraits: ["Brave", "BattleHardened"]
            ),
            HistoricalNationSpec(
                id: "italy", name: "意大利王国", shortName: "意", color: "#3B8749",
                culture: "italian", religion: "catholic", polity: "Republic", style: "fascist",
                capitalLon: 12.5, capitalLat: 41.9, capitalName: "罗马",
                anchors: [
                    HistoricalAnchor(lon: 9.2, lat: 45.5, provinceName: "米兰", weight: 1.05),
                    HistoricalAnchor(lon: 12.1, lat: 45.7, provinceName: "威尼斯", weight: 1.0),
                    HistoricalAnchor(lon: 14.3, lat: 40.8, provinceName: "那不勒斯", weight: 1.1),
                    HistoricalAnchor(lon: 13.8, lat: 37.6, provinceName: "巴勒莫", weight: 1.15),
                    HistoricalAnchor(lon: 9.1, lat: 39.2, provinceName: "卡利亚里", weight: 1.1),
                    HistoricalAnchor(lon: 19.8, lat: 41.3, provinceName: "地拉那", weight: 0.9),
                    HistoricalAnchor(lon: 13.2, lat: 32.9, provinceName: "的黎波里", weight: 1.45),
                ],
                rulerName: "贝尼托·墨索里尼", rulerTitle: "领袖",
                rulerMilitary: 68, rulerAdmin: 70, rulerDiplo: 66, rulerCharisma: 80,
                rulerTraits: ["Hawkish", "Ambitious", "Stubborn"]
            ),
            HistoricalNationSpec(
                id: "spain", name: "西班牙国", shortName: "西", color: "#D99B26",
                culture: "spanish", religion: "catholic", polity: "Empire", style: "junta",
                capitalLon: -3.7, capitalLat: 40.4, capitalName: "马德里",
                anchors: [
                    HistoricalAnchor(lon: 1.8, lat: 41.7, provinceName: "巴塞罗那", weight: 1.1),
                    HistoricalAnchor(lon: -6.0, lat: 37.4, provinceName: "塞维利亚", weight: 1.2),
                    HistoricalAnchor(lon: -9.1, lat: 38.7, provinceName: "里斯本", weight: 1.15),
                    HistoricalAnchor(lon: -2.9, lat: 43.3, provinceName: "毕尔巴鄂", weight: 1.1),
                ],
                rulerName: "弗朗西斯科·佛朗哥", rulerTitle: "考迪罗",
                rulerMilitary: 78, rulerAdmin: 76, rulerDiplo: 74, rulerCharisma: 72,
                rulerTraits: ["IronFist", "Patient", "Veteran"]
            ),
            HistoricalNationSpec(
                id: "finland", name: "芬兰共和国", shortName: "芬", color: "#6FA8DC",
                culture: "norse", religion: "protestant", polity: "Republic", style: "presidential",
                capitalLon: 25.0, capitalLat: 60.8, capitalName: "赫尔辛基",
                anchors: [
                    HistoricalAnchor(lon: 25.5, lat: 65.0, provinceName: "奥卢", weight: 1.2),
                    HistoricalAnchor(lon: 28.7, lat: 60.7, provinceName: "维堡", weight: 0.95),
                    HistoricalAnchor(lon: 25.7, lat: 66.5, provinceName: "拉普兰", weight: 1.2),
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
                    HistoricalAnchor(lon: 11.9, lat: 55.6, provinceName: "哥本哈根", weight: 1.05),
                    HistoricalAnchor(lon: -21.9, lat: 64.1, provinceName: "雷克雅未克", weight: 1.5),
                ],
                rulerName: "哈康七世", rulerTitle: "国王",
                rulerMilitary: 68, rulerAdmin: 78, rulerDiplo: 80, rulerCharisma: 84,
                rulerTraits: ["Just", "Beloved"]
            ),
            HistoricalNationSpec(
                id: "benelux", name: "荷兰-比利时", shortName: "低地", color: "#E67E22",
                culture: "dutch", religion: "protestant", polity: "Kingdom", style: "constitutional",
                capitalLon: 4.9, capitalLat: 52.4, capitalName: "阿姆斯特丹",
                anchors: [
                    HistoricalAnchor(lon: 4.4, lat: 50.8, provinceName: "布鲁塞尔", weight: 0.9),
                    HistoricalAnchor(lon: 7.4, lat: 46.9, provinceName: "伯尔尼", weight: 0.85),
                ],
                rulerName: "威廉明娜", rulerTitle: "女王",
                rulerMilitary: 64, rulerAdmin: 84, rulerDiplo: 82, rulerCharisma: 84,
                rulerTraits: ["Financier", "Beloved"]
            ),
            HistoricalNationSpec(
                id: "romania", name: "罗马尼亚王国", shortName: "罗", color: "#C9A227",
                culture: "roman", religion: "orthodox", polity: "Kingdom", style: "absolute",
                capitalLon: 26.1, capitalLat: 44.4, capitalName: "布加勒斯特",
                anchors: [
                    HistoricalAnchor(lon: 23.6, lat: 46.8, provinceName: "克卢日", weight: 1.0),
                    HistoricalAnchor(lon: 23.3, lat: 42.7, provinceName: "索菲亚", weight: 1.05),
                    HistoricalAnchor(lon: 28.6, lat: 44.2, provinceName: "康斯坦察", weight: 0.95),
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
                    HistoricalAnchor(lon: 21.6, lat: 47.5, provinceName: "德布勒森", weight: 0.9),
                    HistoricalAnchor(lon: 17.1, lat: 48.1, provinceName: "布拉迪斯拉发", weight: 0.85),
                ],
                rulerName: "米克洛什·霍尔蒂", rulerTitle: "摄政王",
                rulerMilitary: 76, rulerAdmin: 74, rulerDiplo: 74, rulerCharisma: 76,
                rulerTraits: ["NavalMastery", "Veteran"]
            ),
            HistoricalNationSpec(
                id: "yugoslavia", name: "南斯拉夫王国", shortName: "南", color: "#5B6ABF",
                culture: "slavic", religion: "orthodox", polity: "Kingdom", style: "absolute",
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
                culture: "greek", religion: "orthodox", polity: "Kingdom", style: "absolute",
                capitalLon: 23.7, capitalLat: 38.0, capitalName: "雅典",
                anchors: [
                    HistoricalAnchor(lon: 22.9, lat: 40.6, provinceName: "塞萨洛尼基", weight: 0.95),
                    HistoricalAnchor(lon: 25.0, lat: 35.3, provinceName: "克里特", weight: 1.1),
                ],
                rulerName: "扬尼斯·梅塔克萨斯", rulerTitle: "首相",
                rulerMilitary: 80, rulerAdmin: 76, rulerDiplo: 74, rulerCharisma: 78,
                rulerTraits: ["BattleHardened", "Veteran"]
            ),
            HistoricalNationSpec(
                id: "turkey", name: "土耳其共和国", shortName: "土", color: "#C0392B",
                culture: "turkic", religion: "islam", polity: "Republic", style: "presidential",
                capitalLon: 32.9, capitalLat: 39.9, capitalName: "安卡拉",
                anchors: [
                    HistoricalAnchor(lon: 28.4, lat: 41.4, provinceName: "伊斯坦布尔", weight: 1.15),
                    HistoricalAnchor(lon: 27.1, lat: 38.4, provinceName: "伊兹密尔", weight: 1.15),
                    HistoricalAnchor(lon: 41.3, lat: 39.9, provinceName: "埃尔祖鲁姆", weight: 1.3),
                    HistoricalAnchor(lon: 35.3, lat: 37.0, provinceName: "阿达纳", weight: 1.2),
                ],
                rulerName: "伊斯梅特·伊纳尼", rulerTitle: "总统",
                rulerMilitary: 80, rulerAdmin: 84, rulerDiplo: 90, rulerCharisma: 82,
                rulerTraits: ["MasterDiplomat", "Reformer", "Patient"]
            ),
        ],
        openingWars: [
            HistoricalWarSpec(attackerId: "germany", defenderId: "poland", casusBelli: "白色方案 · 闪击波兰"),
            HistoricalWarSpec(attackerId: "germany", defenderId: "uk", casusBelli: "二战爆发 · 英德宣战"),
            HistoricalWarSpec(attackerId: "germany", defenderId: "france", casusBelli: "西线对峙 · 法德宣战"),
        ],
        openingAlliances: [
            HistoricalAllianceSpec(name: "反法西斯盟国", memberIds: ["uk", "france", "poland"]),
            HistoricalAllianceSpec(name: "轴心国", memberIds: ["germany", "italy"]),
        ],
        tags: ["二战", "欧洲战场", "闪电战", "现代"]
    )

    // 剧本 8：二战亚洲太平洋 · 太平洋风暴（公元 1941 年 12 月）
    private static let ww2Asia1941 = HistoricalScenario(
        id: "ww2_asia_1941",
        title: "二战亚洲太平洋 · 太平洋风暴",
        subtitle: "1941年12月 · 全民族抗战与太平洋战火",
        region: .eastAsiaJapan,
        year: 1941,
        eraName: "二战亚太",
        description: "1941年12月，太平洋战争爆发，日军南下香港、菲律宾与东南亚，正面战场中华民国死守西南大后方，延安抗日根据地深入敌后牵制华北，关东军与苏联远东方面军陈兵百万隔江对峙。",
        author: "列国纪官方",
        isOfficial: true,
        provinceCount: 135,
        nations: [
            HistoricalNationSpec(
                id: "roc", name: "中华民国", shortName: "国", color: "#2B6CB0",
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
                    HistoricalAnchor(lon: 116.0, lat: 26.0, provinceName: "赣州", weight: 1.15),
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
                    HistoricalAnchor(lon: 113.3, lat: 36.6, provinceName: "太行", weight: 0.95),
                    HistoricalAnchor(lon: 114.6, lat: 38.8, provinceName: "晋察冀", weight: 0.95),
                    HistoricalAnchor(lon: 120.5, lat: 37.0, provinceName: "胶东", weight: 0.95),
                    HistoricalAnchor(lon: 119.3, lat: 33.4, provinceName: "苏北", weight: 0.9),
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
                    HistoricalAnchor(lon: 127.0, lat: 37.6, provinceName: "京城", weight: 1.25),
                    HistoricalAnchor(lon: 129.0, lat: 35.2, provinceName: "釜山", weight: 1.15),
                    HistoricalAnchor(lon: 121.5, lat: 25.0, provinceName: "台北", weight: 1.2),
                    HistoricalAnchor(lon: 121.5, lat: 31.2, provinceName: "上海", weight: 1.15),
                    HistoricalAnchor(lon: 118.8, lat: 32.1, provinceName: "南京", weight: 1.1),
                    HistoricalAnchor(lon: 116.4, lat: 39.9, provinceName: "北平", weight: 1.1),
                    HistoricalAnchor(lon: 114.3, lat: 30.6, provinceName: "武汉", weight: 1.05),
                    HistoricalAnchor(lon: 113.3, lat: 23.1, provinceName: "广州", weight: 1.05),
                    HistoricalAnchor(lon: 127.8, lat: 26.3, provinceName: "冲绳", weight: 1.1),
                    HistoricalAnchor(lon: 110.0, lat: 19.3, provinceName: "海南", weight: 1.1),
                ],
                rulerName: "东条英机", rulerTitle: "首相",
                rulerMilitary: 84, rulerAdmin: 78, rulerDiplo: 56, rulerCharisma: 74,
                rulerTraits: ["Hawkish", "NavalMastery", "IronFist", "Stubborn"]
            ),
            HistoricalNationSpec(
                id: "manchukuo", name: "关东军·伪满洲", shortName: "满", color: "#B7950B",
                culture: "chinese", religion: "confucian", polity: "Empire", style: "junta",
                capitalLon: 125.3, capitalLat: 43.9, capitalName: "新京",
                anchors: [
                    HistoricalAnchor(lon: 123.4, lat: 41.8, provinceName: "奉天", weight: 1.15),
                    HistoricalAnchor(lon: 126.6, lat: 45.8, provinceName: "哈尔滨", weight: 1.25),
                    HistoricalAnchor(lon: 121.6, lat: 38.9, provinceName: "大连", weight: 1.05),
                    HistoricalAnchor(lon: 123.9, lat: 47.3, provinceName: "齐齐哈尔", weight: 1.25),
                    HistoricalAnchor(lon: 118.0, lat: 41.0, provinceName: "热河", weight: 1.1),
                ],
                rulerName: "梅津美治郎", rulerTitle: "关东军司令",
                rulerMilitary: 82, rulerAdmin: 72, rulerDiplo: 60, rulerCharisma: 66,
                rulerTraits: ["Hawkish", "Veteran"]
            ),
            HistoricalNationSpec(
                id: "ussr_fe", name: "苏联远东", shortName: "苏", color: "#9B1C1C",
                culture: "slavic", religion: "orthodox", polity: "Republic", style: "communist",
                capitalLon: 131.9, capitalLat: 43.1, capitalName: "海参崴",
                anchors: [
                    HistoricalAnchor(lon: 135.1, lat: 48.5, provinceName: "伯力", weight: 1.45),
                    HistoricalAnchor(lon: 113.5, lat: 50.0, provinceName: "赤塔", weight: 1.7),
                    HistoricalAnchor(lon: 127.5, lat: 50.3, provinceName: "海兰泡", weight: 1.4),
                    HistoricalAnchor(lon: 106.9, lat: 47.9, provinceName: "乌兰巴托", weight: 1.75),
                    HistoricalAnchor(lon: 142.8, lat: 49.0, provinceName: "北库页", weight: 1.35),
                ],
                rulerName: "格奥尔基·朱可夫", rulerTitle: "大将",
                rulerMilitary: 94, rulerAdmin: 80, rulerDiplo: 74, rulerCharisma: 88,
                rulerTraits: ["Tactician", "BattleHardened", "Veteran"]
            ),
            HistoricalNationSpec(
                id: "uk_burma", name: "英属缅甸与香港", shortName: "英", color: "#D65A5A",
                culture: "english", religion: "protestant", polity: "Republic", style: "protectorate",
                capitalLon: 96.1, capitalLat: 22.0, capitalName: "曼德勒",
                anchors: [
                    HistoricalAnchor(lon: 96.4, lat: 18.6, provinceName: "仰光北", weight: 1.35),
                    HistoricalAnchor(lon: 97.4, lat: 25.4, provinceName: "密支那", weight: 1.3),
                    HistoricalAnchor(lon: 114.2, lat: 22.7, provinceName: "香港", weight: 0.72),
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
                    HistoricalAnchor(lon: 106.2, lat: 21.0, provinceName: "海防", weight: 0.95),
                    HistoricalAnchor(lon: 106.4, lat: 18.2, provinceName: "顺化", weight: 1.1),
                    HistoricalAnchor(lon: 102.6, lat: 19.2, provinceName: "万象", weight: 1.05),
                ],
                rulerName: "让·德古", rulerTitle: "总督",
                rulerMilitary: 66, rulerAdmin: 74, rulerDiplo: 72, rulerCharisma: 68,
                rulerTraits: ["Administrator", "Patient"]
            ),
            HistoricalNationSpec(
                id: "philippines", name: "美属菲律宾", shortName: "美菲", color: "#3B82C4",
                culture: "english", religion: "catholic", polity: "Federation", style: "federal",
                capitalLon: 121.0, capitalLat: 18.1, capitalName: "马尼拉",
                anchors: [
                    HistoricalAnchor(lon: 121.7, lat: 19.1, provinceName: "吕宋北", weight: 1.15),
                    HistoricalAnchor(lon: 120.5, lat: 18.5, provinceName: "碧瑶", weight: 1.05),
                ],
                rulerName: "道格拉斯·麦克阿瑟", rulerTitle: "远东总司令",
                rulerMilitary: 90, rulerAdmin: 80, rulerDiplo: 82, rulerCharisma: 90,
                rulerTraits: ["Charismatic", "NavalMastery", "Tactician"]
            ),
            HistoricalNationSpec(
                id: "thailand", name: "泰国", shortName: "泰", color: "#2E8B57",
                culture: "vietnamese", religion: "buddhism", polity: "Empire", style: "junta",
                capitalLon: 99.6, capitalLat: 18.9, capitalName: "清迈",
                anchors: [
                    HistoricalAnchor(lon: 100.6, lat: 18.2, provinceName: "湄南", weight: 1.15),
                    HistoricalAnchor(lon: 98.8, lat: 18.0, provinceName: "泰北", weight: 1.05),
                ],
                rulerName: "銮披汶·颂堪", rulerTitle: "元帅",
                rulerMilitary: 74, rulerAdmin: 74, rulerDiplo: 78, rulerCharisma: 76,
                rulerTraits: ["Ambitious", "Diplomatic"]
            ),
        ],
        openingWars: [
            HistoricalWarSpec(attackerId: "japan", defenderId: "roc", casusBelli: "全面抗日战争"),
            HistoricalWarSpec(attackerId: "japan", defenderId: "yanan", casusBelli: "华北敌后抗战"),
            HistoricalWarSpec(attackerId: "japan", defenderId: "philippines", casusBelli: "太平洋战争 · 吕宋战役"),
            HistoricalWarSpec(attackerId: "japan", defenderId: "uk_burma", casusBelli: "香港与缅甸战役"),
        ],
        openingAlliances: [
            HistoricalAllianceSpec(name: "世界反法西斯同盟", memberIds: ["roc", "yanan", "uk_burma", "philippines"]),
            HistoricalAllianceSpec(name: "东亚轴心", memberIds: ["japan", "manchukuo", "thailand"]),
        ],
        tags: ["二战", "亚太战场", "抗战", "太平洋"]
    )
}
