import Foundation

// MARK: - 历史剧本真实人物、家族、党派与国力编制模型（v6.0.0）

/// 历史人物精确规格（纯 Foundation，兼容 iOS 17+ 与 Linux Swift 5.10）。
public struct HistoricalPersonSpec: Codable, Sendable {
    public var name: String
    public var surname: String
    public var given: String
    public var title: String
    public var age: Int
    public var gender: Int // 0 = 男, 1 = 女
    public var military: Int
    public var administrative: Int
    public var diplomatic: Int
    public var charisma: Int
    public var traits: [String]
    public var role: String // "Ruler", "Successor", "WarCommander", "Admiral", "Chancellor", "Treasurer", "Diplomat"
    public var relationNote: String

    public init(
        name: String,
        surname: String,
        given: String,
        title: String,
        age: Int,
        gender: Int = 0,
        military: Int,
        administrative: Int,
        diplomatic: Int,
        charisma: Int,
        traits: [String] = [],
        role: String = "Ruler",
        relationNote: String = ""
    ) {
        self.name = name
        self.surname = surname
        self.given = given
        self.title = title
        self.age = age
        self.gender = gender
        self.military = military
        self.administrative = administrative
        self.diplomatic = diplomatic
        self.charisma = charisma
        self.traits = traits
        self.role = role
        self.relationNote = relationNote
    }
}

/// 历史世家 / 宗室 / 政治派系家族规格。
public struct HistoricalFamilySpec: Codable, Sendable {
    public var surname: String
    public var label: String
    public var influence: Int
    public var relationToRuler: Int
    public var isRuling: Bool

    public init(
        surname: String,
        label: String,
        influence: Int,
        relationToRuler: Int = 45,
        isRuling: Bool = false
    ) {
        self.surname = surname
        self.label = label
        self.influence = influence
        self.relationToRuler = relationToRuler
        self.isRuling = isRuling
    }
}

/// 历史真实党派 / 朝堂派系席位规格。
public struct HistoricalPartySpec: Codable, Sendable {
    public var name: String
    public var seats: Int

    public init(name: String, seats: Int) {
        self.name = name
        self.seats = seats
    }
}

/// 历史国家工业实力、人力、四线科技代差、海军编制、国家特性、任期与核武起点规格。
public struct HistoricalPowerSpec: Codable, Sendable {
    public var industryIndex: Double
    public var manpowerScale: Double
    public var techMil: Int
    public var techEco: Int
    public var techSta: Int
    public var techNav: Int
    public var fleetCount: Int
    public var shipsPerFleet: Int
    public var navalPowerBonus: Double
    public var stateTraits: [String]
    public var isLifetimeRuler: Bool
    public var termYears: Int
    public var startingNukes: Int
    public var nuclearProgress: Double
    public var startingReactors: Int
    public var warSupport: Double
    /// v10.0.0：史实开局常备军团数（按国情而非省份数，杜绝广土荒原开局爆兵）。
    public var startingArmies: Int?
    /// v10.0.0：史实常备军团编制上限（供 `Armies.maxArmiesCap` 弹性动员缩放）。
    public var maxArmies: Int?

    public init(
        industryIndex: Double,
        manpowerScale: Double,
        techMil: Int,
        techEco: Int,
        techSta: Int,
        techNav: Int,
        fleetCount: Int = 0,
        shipsPerFleet: Int = 4,
        navalPowerBonus: Double = 0.0,
        stateTraits: [String] = [],
        isLifetimeRuler: Bool = true,
        termYears: Int = 4,
        startingNukes: Int = 0,
        nuclearProgress: Double = 0.0,
        startingReactors: Int = 0,
        warSupport: Double = 55.0,
        startingArmies: Int? = nil,
        maxArmies: Int? = nil
    ) {
        self.industryIndex = industryIndex
        self.manpowerScale = manpowerScale
        self.techMil = techMil
        self.techEco = techEco
        self.techSta = techSta
        self.techNav = techNav
        self.fleetCount = fleetCount
        self.shipsPerFleet = shipsPerFleet
        self.navalPowerBonus = navalPowerBonus
        self.stateTraits = stateTraits
        self.isLifetimeRuler = isLifetimeRuler
        self.termYears = termYears
        self.startingNukes = startingNukes
        self.nuclearProgress = nuclearProgress
        self.startingReactors = startingReactors
        self.warSupport = warSupport
        self.startingArmies = startingArmies
        self.maxArmies = maxArmies
    }
}

/// 历史世家 / 现代政治派系之间的既定关系（如二战日本陆军统制派 vs 海军舰队派宿敌 −48）。
public struct HistoricalFamilyRelationSpec: Codable, Sendable {
    public var surnameA: String
    public var surnameB: String
    public var relation: Int

    public init(_ surnameA: String, _ surnameB: String, _ relation: Int) {
        self.surnameA = surnameA
        self.surnameB = surnameB
        self.relation = relation
    }
}

/// 单个历史国家完整名录编制。
public struct HistoricalNationRoster: Codable, Sendable {
    public var nationIndex: Int
    public var founder: HistoricalPersonSpec
    public var successors: [HistoricalPersonSpec]
    public var notables: [HistoricalPersonSpec]
    public var families: [HistoricalFamilySpec]
    public var parties: [HistoricalPartySpec]
    public var power: HistoricalPowerSpec
    public var familyRelations: [HistoricalFamilyRelationSpec]
    /// 史实君主固定年号（如日本昭和天皇锁定「昭和」、大正天皇锁定「大正」，避免随机抽取错误年号）。
    public var fixedEraName: String?

    public init(
        nationIndex: Int,
        founder: HistoricalPersonSpec,
        successors: [HistoricalPersonSpec],
        notables: [HistoricalPersonSpec],
        families: [HistoricalFamilySpec],
        parties: [HistoricalPartySpec],
        power: HistoricalPowerSpec,
        familyRelations: [HistoricalFamilyRelationSpec] = [],
        fixedEraName: String? = nil
    ) {
        self.nationIndex = nationIndex
        self.founder = founder
        self.successors = successors
        self.notables = notables
        self.families = families
        self.parties = parties
        self.power = power
        self.familyRelations = familyRelations
        self.fixedEraName = fixedEraName
    }
}

// MARK: - 十大官方历史剧本真实名录与引擎接入

public enum HistoricalRoster {
    /// 全部 12 个官方历史剧本的真实历史名录与国力设定（含 1936 战云密布、1931 九一八抗战与 27/28 国细化欧洲）。
    public static let scenarios: [String: [HistoricalNationRoster]] = [
        "zhanguo_260bce": zhanguo260bce,
        "sanguo_208": sanguo208,
        "tang_755": tang755,
        "song_jin_1142": songJin1142,
        "sengoku_1560": sengoku1560,
        "napoleon_1812": napoleon1812,
        "ww1_1914": ww1_1914,
        "china_1931": china1931,
        "ww2_eve_1936": ww2Eve1936,
        "ww2_europe_1939": ww2Europe1939,
        "ww2_asia_1941": ww2Asia1941,
        "coldwar_1950": coldwar1950,
    ]

    public static func roster(scenarioId: String) -> [HistoricalNationRoster] {
        scenarios[scenarioId] ?? []
    }

    public static func nationRoster(scenarioId: String, nationIndex: Int) -> HistoricalNationRoster? {
        roster(scenarioId: scenarioId).first { $0.nationIndex == nationIndex }
    }

    // MARK: - 任期保护与历史继任队列辅助（供 People.swift 调用）

    /// 查询该国任期政策（是否终身制及合法届期年限）。
    public static func termPolicy(_ r: JS, nationId: String) -> (isLifetime: Bool, termYears: Int)? {
        guard !r.regimes.isNull else { return nil }
        if !r.regimes.historicalTermPolicy.isNull {
            let p = r.regimes.historicalTermPolicy[nationId]
            if !p.isNull {
                let life = p.isLifetimeRuler.optionalBool ?? false
                let yrs = max(4, p.termYears.optionalNumber.map(Int.init) ?? 4)
                return (life, yrs)
            }
        }
        if !r.regimes.historicalPower.isNull {
            let p = r.regimes.historicalPower[nationId]
            if !p.isNull {
                let life = p.isLifetimeRuler.optionalBool ?? false
                let yrs = max(4, p.termYears.optionalNumber.map(Int.init) ?? 4)
                return (life, yrs)
            }
        }
        return nil
    }

    /// 计算新任统治者的任期截止日（终身制为 40 年，选举制至少 4 年，杜绝开局/短期被异常换人）。
    public static func termEndDay(_ r: JS, nationId: String, fromDay day: Double, fallbackSeed: UInt32) -> Double {
        if let pol = termPolicy(r, nationId: nationId) {
            let years = pol.isLifetime ? 40 : max(4, pol.termYears)
            return day + Double(years) * 365.0
        }
        if !r.regimes.isNull && !r.regimes.historicalScenarioId.isNull {
            let polity = r.civilization.isNull ? "Kingdom" : (r.civilization.nations[nationId].polity.optionalString ?? "Kingdom")
            let styleId = Regimes.style(r, nationId).id
            let isLife = (polity != "Republic" && polity != "Federation")
                || ["communist", "fascist", "nazi", "junta", "absolute", "autocracy"].contains(styleId)
            return day + Double(isLife ? 40 : 4) * 365.0
        }
        return day + Double((12 + Int(fallbackSeed % 14)) * 365)
    }

    /// 判断某历史国家的现任在世领袖是否受任期保护（终身制领袖或任期尚未届满者，严禁被定期选举提前顶替）。
    public static func isTermProtected(_ r: JS, nationId: String) -> Bool {
        guard !r.regimes.isNull else { return false }
        let isHistorical = !r.regimes.historicalScenarioId.isNull || termPolicy(r, nationId: nationId) != nil
        guard isHistorical else { return false }
        let lid = r.people.isNull ? 0 : (r.people.nations[nationId].leaderId.optionalNumber.map(Int.init) ?? 0)
        guard lid > 0, let leader = People.person(r, lid), leader.isAlive.asBool else { return false }
        let day = r.world.day.optionalNumber ?? 0
        if let pol = termPolicy(r, nationId: nationId) {
            if pol.isLifetime { return true }
            let minSpan = Double(max(4, pol.termYears)) * 365.0
            let reign = (!r.chronicle.isNull && !r.chronicle.leaders[nationId].isNull) ? r.chronicle.leaders[nationId].asArray.last : nil
            let asc = reign?.ascendedDay.optionalNumber ?? 0
            let recordedEnd = reign?.termEndDay.optionalNumber ?? (asc + minSpan)
            let effectiveEnd = max(recordedEnd, asc + minSpan)
            return day < effectiveEnd
        }
        let styleId = Regimes.style(r, nationId).id
        if ["communist", "fascist", "nazi", "junta"].contains(styleId) { return true }
        let reign = (!r.chronicle.isNull && !r.chronicle.leaders[nationId].isNull) ? r.chronicle.leaders[nationId].asArray.last : nil
        let asc = reign?.ascendedDay.optionalNumber ?? 0
        let recordedEnd = reign?.termEndDay.optionalNumber ?? (asc + 4.0 * 365.0)
        return day < max(recordedEnd, asc + 4.0 * 365.0)
    }

    /// 预览下一位真实历史继任者（用于定期换届大选返回真实候选人，不重复建人，正式就职时再出队）。
    public static func peekNextSuccessor(_ r: JS, nationId: String, excludingPersonId: Int) -> JS? {
        resolveQueueSuccessor(r, nationId: nationId, excludingPersonId: excludingPersonId, consume: false)
    }

    /// 弹出并返回下一位真实历史继任者（供 `People.knownSuccessor` 优先调用）。
    public static func popNextSuccessor(_ r: JS, nationId: String, excludingPersonId: Int) -> JS? {
        resolveQueueSuccessor(r, nationId: nationId, excludingPersonId: excludingPersonId, consume: true)
    }

    /// 若新就职人物正好对应队列首位历史继任者，则将其移出队列避免重复继任。
    public static func consumeIfQueueHead(_ r: JS, nationId: String, person: JS) {
        guard !r.regimes.isNull, !r.regimes.historicalSuccessors.isNull else { return }
        let queue = r.regimes.historicalSuccessors[nationId]
        guard queue.isArray, queue.length > 0 else { return }
        let head = queue[0]
        let pid = person.id.asInt
        let pname = person.identity.name.optionalString ?? ""
        let hPid = head.personId.optionalNumber.map(Int.init) ?? 0
        let hName = head.name.optionalString ?? ""
        if (hPid > 0 && hPid == pid) || (!hName.isEmpty && hName == pname) {
            var arr = queue.asArray
            arr.removeFirst()
            r.regimes.historicalSuccessors[nationId] = .array(arr)
        }
    }

    /// 判断某人是否为历史继任队列的首位候选。
    public static func matchesQueueHead(_ r: JS, nationId: String, person: JS) -> Bool {
        guard !r.regimes.isNull, !r.regimes.historicalSuccessors.isNull else { return false }
        let queue = r.regimes.historicalSuccessors[nationId]
        guard queue.isArray, queue.length > 0 else { return false }
        let head = queue[0]
        let hPid = head.personId.optionalNumber.map(Int.init) ?? 0
        let hName = head.name.optionalString ?? ""
        let pname = person.identity.name.optionalString ?? ""
        return (hPid > 0 && hPid == person.id.asInt) || (!hName.isEmpty && hName == pname)
    }

    private static func resolveQueueSuccessor(_ r: JS, nationId: String, excludingPersonId: Int, consume: Bool) -> JS? {
        guard !r.regimes.isNull, !r.regimes.historicalSuccessors.isNull else { return nil }
        let queue = r.regimes.historicalSuccessors[nationId]
        guard queue.isArray, queue.length > 0 else { return nil }

        let stateId = r.people.isNull ? 0 : (r.people.nations[nationId].id.optionalNumber.map(Int.init) ?? 0)
        guard stateId > 0 else { return nil }
        let civN = r.civilization.isNull ? JS.null : r.civilization.nations[nationId]
        let culture = civN.cultureId.optionalString ?? "chinese"
        let religion = civN.religionId.optionalString ?? "confucian"
        let polity = civN.polity.optionalString ?? "Kingdom"

        var arr = queue.asArray
        while !arr.isEmpty {
            let entry = arr[0]
            let targetName = entry.name.optionalString ?? ""
            let linkedId = entry.personId.optionalNumber.map(Int.init) ?? 0

            // 1. 若已预置为宗室储君或朝中名将（例如司马懿、羽柴秀吉、德川家康、艾森豪威尔、戴高乐、邓尼茨、周恩来），直接复用本人！
            if linkedId > 0, let existing = People.person(r, linkedId) {
                if existing.isAlive.asBool && existing.id.asInt != excludingPersonId {
                    if let t = entry.title.optionalString, !t.isEmpty {
                        existing.historicalTitle = JS(t)
                    }
                    if consume {
                        arr.removeFirst()
                        r.regimes.historicalSuccessors[nationId] = .array(arr)
                    } else {
                        r.regimes.historicalSuccessors[nationId] = .array(arr)
                    }
                    return existing
                } else {
                    // 该历史人物已先一步身故，顺延至队列下一位真实历史继任者
                    arr.removeFirst()
                    continue
                }
            }

            // 2. 按姓名在同国在世人物中检索（避免重复建档）
            if !targetName.isEmpty, !r.kin.isNull, !r.kin.persons.isNull {
                if let match = r.kin.persons.objectValues.first(where: {
                    $0.stateId.asInt == stateId &&
                    $0.id.asInt != excludingPersonId &&
                    $0.identity.name.optionalString == targetName
                }) {
                    if match.isAlive.asBool {
                        entry.personId = match.id.clone()
                        if let t = entry.title.optionalString, !t.isEmpty {
                            match.historicalTitle = JS(t)
                        }
                        if consume {
                            arr.removeFirst()
                        }
                        r.regimes.historicalSuccessors[nationId] = .array(arr)
                        return match
                    } else {
                        arr.removeFirst()
                        continue
                    }
                }
            }

            // 3. 尚未入档：即时实例化完整合规的 r.kin.persons / r.life.persons / r.people.persons 记录
            let surname = entry.surname.optionalString ?? ""
            let familyId = resolveFamilyId(r, nationId: nationId, stateId: stateId, surname: surname)
            let created = materializePerson(
                r,
                specJS: entry,
                nationId: nationId,
                stateId: stateId,
                familyId: familyId,
                culture: culture,
                religion: religion,
                polity: polity
            )
            entry.personId = created.id.clone()
            if consume {
                arr.removeFirst()
            }
            r.regimes.historicalSuccessors[nationId] = .array(arr)
            return created
        }

        r.regimes.historicalSuccessors[nationId] = .array([])
        return nil
    }

    // MARK: - 整局历史名录与国力写入入口

    /// 将指定历史剧本的全部真实领袖、历史继任队列、名将名臣、海军提督、世家大族、真实党派、
    /// 工业与人力修正、四线科技代差、国家特性、核武起点与舰队编制一次性写入 `run`。
    public static func apply(run r: JS, scenarioId: String) {
        let entries = roster(scenarioId: scenarioId)
        guard !entries.isEmpty, !r.world.isNull, r.world.nations.isArray else { return }

        Regimes.enable(r)
        r.regimes.historicalScenarioId = JS(scenarioId)
        r.regimes.historicalAppliedDay = r.world.day.clone()
        if r.regimes.historicalSuccessors.isNull { r.regimes.historicalSuccessors = .object() }
        if r.regimes.historicalPower.isNull { r.regimes.historicalPower = .object() }
        if r.regimes.historicalTermPolicy.isNull { r.regimes.historicalTermPolicy = .object() }
        if r.regimes.historicalFleets.isNull { r.regimes.historicalFleets = .object() }
        if r.regimes.nuclear.isNull { r.regimes.nuclear = .object() }
        if r.regimes.tech.isNull { r.regimes.tech = .object() }
        if r.regimes.fleetMeta.isNull { r.regimes.fleetMeta = .object() }

        let nations = r.world.nations.asArray
        let provinces = r.world.provinces.isArray ? r.world.provinces.asArray : []
        let nowDay = r.world.day.optionalNumber ?? 0

        for entry in entries {
            guard entry.nationIndex >= 0 && entry.nationIndex < nations.count else { continue }
            let nation = nations[entry.nationIndex]
            guard let nid = nation.id.optionalString, !nid.isEmpty else { continue }
            let stateId = r.people.isNull ? 0 : (r.people.nations[nid].id.optionalNumber.map(Int.init) ?? 0)
            guard stateId > 0 else { continue }

            let civN = r.civilization.isNull ? JS.null : r.civilization.nations[nid]
            let culture = civN.cultureId.optionalString ?? "chinese"
            let religion = civN.religionId.optionalString ?? "confucian"
            let polity = civN.polity.optionalString ?? "Kingdom"
            let book = Regimes.book(r, nid)

            // 1. 写入任期政策（终身制 / 真实任期年限），保障开局与后续绝无首月卸任
            let termPol = JS.object()
            termPol.isLifetimeRuler = JS(entry.power.isLifetimeRuler)
            termPol.termYears = JS(max(4, entry.power.termYears))
            r.regimes.historicalTermPolicy[nid] = termPol

            // 2. 写入工业能力、人力规模、海战加成、科技起点、核武与战争支持度
            let hp = JS.object()
            hp.industryIndex = JS(entry.power.industryIndex)
            hp.manpowerScale = JS(entry.power.manpowerScale)
            hp.navalPowerBonus = JS(entry.power.navalPowerBonus)
            hp.techMil = JS(entry.power.techMil)
            hp.techEco = JS(entry.power.techEco)
            hp.techSta = JS(entry.power.techSta)
            hp.techNav = JS(entry.power.techNav)
            hp.fleetCount = JS(entry.power.fleetCount)
            hp.shipsPerFleet = JS(entry.power.shipsPerFleet)
            hp.isLifetimeRuler = JS(entry.power.isLifetimeRuler)
            hp.termYears = JS(max(4, entry.power.termYears))
            hp.startingNukes = JS(entry.power.startingNukes)
            hp.nuclearProgress = JS(entry.power.nuclearProgress)
            hp.startingReactors = JS(entry.power.startingReactors)
            hp.warSupport = JS(entry.power.warSupport)
            let fallbackStartRaw = Int((0.8 + entry.power.industryIndex * 2.1 + entry.power.manpowerScale * 1.4 + Double(entry.power.techMil) * 0.4 + (entry.power.warSupport - 55.0) * 0.03).rounded())
            let fallbackStart: Int
            if entry.power.industryIndex < 0.9 && entry.power.manpowerScale < 0.65 {
                fallbackStart = max(1, min(2, fallbackStartRaw))
            } else {
                fallbackStart = max(2, min(16, fallbackStartRaw))
            }
            let resolvedStartArmies = entry.power.startingArmies ?? fallbackStart
            let resolvedMaxArmies = entry.power.maxArmies
                ?? max(resolvedStartArmies + 1, min(30, Int((Double(resolvedStartArmies) * 1.80 + 1.5).rounded())))
            hp.startingArmies = JS(resolvedStartArmies)
            hp.maxArmies = JS(resolvedMaxArmies)
            r.regimes.historicalPower[nid] = hp

            let indCap = (entry.power.industryIndex * 100.0).rounded()
            book.industrialCapacity = JS(indCap)
            book.industryIndex = JS(entry.power.industryIndex)
            book.manpowerScale = JS(entry.power.manpowerScale)
            book.warSupport = JS(entry.power.warSupport)
            book.nukes = JS(entry.power.startingNukes)
            book.reactors = JS(entry.power.startingReactors)
            book.nuclearProgress = JS(entry.power.nuclearProgress)
            book.navalPowerBonus = JS(entry.power.navalPowerBonus)

            let nuc = JS.object()
            nuc.nukes = JS(entry.power.startingNukes)
            nuc.reactors = JS(entry.power.startingReactors)
            nuc.progress = JS(entry.power.nuclearProgress)
            r.regimes.nuclear[nid] = nuc

            // 3. 写入四线科技初始阶数（拉开真实时代与强弱科技代差）
            let techObj = WorldDepth.techBook(r, nation: nid)
            techObj["military"].level = JS(max(1, min(6, entry.power.techMil)))
            techObj["military"].progress = JS(0)
            techObj["economy"].level = JS(max(1, min(6, entry.power.techEco)))
            techObj["economy"].progress = JS(0)
            techObj["statecraft"].level = JS(max(1, min(6, entry.power.techSta)))
            techObj["statecraft"].progress = JS(0)
            techObj["naval"].level = JS(max(1, min(6, entry.power.techNav)))
            techObj["naval"].progress = JS(0)

            // 4. 写入国家特性（全部校验为 Government.stateTraits 合法键）
            let validStateTraits = entry.power.stateTraits.filter { Government.stateTraits.contains($0) }
            if !validStateTraits.isEmpty && !r.stateTraits47.isNull {
                r.stateTraits47[nid] = .array(validStateTraits.map { JS($0) })
            }

            // 5. 替换/重命名本国世家大族与宗室（彻底清除多余随机异族世家，100% 本土文化化并注入真实派系对立关系）
            let (rulingFamId, familyIdBySurname, allFamilyIds) = applyFamilies(
                r,
                nationId: nid,
                stateId: stateId,
                culture: culture,
                religion: religion,
                specs: entry.families,
                relations: entry.familyRelations,
                provinces: provinces
            )

            // 6. 覆写开国真实领袖（真实姓名、头衔、年龄、四维、特质及安全任期 termEndDay）
            let founderId = applyFounder(
                r,
                nationId: nid,
                stateId: stateId,
                rulingFamilyId: rulingFamId,
                culture: culture,
                religion: religion,
                polity: polity,
                spec: entry.founder,
                power: entry.power,
                nowDay: nowDay,
                fixedEraName: entry.fixedEraName
            )

            // 7. 植入真实历史党派 / 朝堂派系（归一化至 100 席并锁定防随机覆写）
            applyParties(r, nationId: nid, book: book, specs: entry.parties)

            // 8. 植入名将、名相、重臣、外交家与海军提督，并直接任职到 r.offices47 与 posts
            let (notableByName, admiralEntries) = applyNotablesAndOffices(
                r,
                nationId: nid,
                stateId: stateId,
                rulingFamilyId: rulingFamId,
                familyIdBySurname: familyIdBySurname,
                allFamilyIds: allFamilyIds,
                culture: culture,
                religion: religion,
                polity: polity,
                book: book,
                notables: entry.notables,
                provinces: provinces
            )

            // 9. 写入海军舰队开局编制（供海军系统生成舰队，并立即为已有舰队挂载历史提督）
            let fleetSpec = JS.object()
            fleetSpec.fleetCount = JS(entry.power.fleetCount)
            fleetSpec.shipsPerFleet = JS(entry.power.shipsPerFleet)
            fleetSpec.navalPowerBonus = JS(entry.power.navalPowerBonus)
            fleetSpec.admirals = .array(admiralEntries)
            r.regimes.historicalFleets[nid] = fleetSpec
            attachAdmiralsToExistingFleets(r, nationId: nid, admirals: admiralEntries)

            // 10. 序列化历史继任链队列（君主制顺手将首位同姓储君预先入族谱，避免首月无储君且永不重复建档）
            var serializedSuccessors = [JS]()
            for (sIdx, succ) in entry.successors.enumerated() {
                let sObj = serializePerson(succ)
                if let existingPid = notableByName[succ.name] {
                    sObj.personId = JS(existingPid)
                } else if sIdx == 0 && (polity == "Kingdom" || polity == "Empire") && rulingFamId > 0 {
                    let rulingKin = r.kin.families[String(rulingFamId)]
                    let rulingSurname = rulingKin.surname.optionalString ?? ""
                    let sameHouse = !rulingSurname.isEmpty && (succ.surname == rulingSurname || succ.name.hasPrefix(rulingSurname))
                    if sameHouse && !rulingKin.isNull {
                        let heirPerson = materializePerson(
                            r,
                            specJS: sObj,
                            nationId: nid,
                            stateId: stateId,
                            familyId: rulingFamId,
                            culture: culture,
                            religion: religion,
                            polity: polity
                        )
                        sObj.personId = heirPerson.id.clone()
                        rulingKin.heirId = heirPerson.id.clone()
                        if founderId > 0, let founder = People.person(r, founderId),
                           succ.relationNote.contains("子") || succ.relationNote.contains("太子") || succ.relationNote.contains("储") || succ.relationNote.contains("世子") {
                            heirPerson.fatherId = founder.id.clone()
                            if founder.childrenIds.isNull { founder.childrenIds = .array() }
                            if !founder.childrenIds.asArray.contains(where: { $0.asInt == heirPerson.id.asInt }) {
                                founder.childrenIds.push(heirPerson.id.clone())
                            }
                        }
                    }
                }
                serializedSuccessors.append(sObj)
            }
            r.regimes.historicalSuccessors[nid] = .array(serializedSuccessors)
        }

        // 同步国家特性至战斗与国运账本
        Government.recordStateTraits(r)
        Government.refreshLeaderCombat(r)
        if !r.people.isNull { r.people.revision = JS(r.people.revision.asNumber + 1) }
        if !r.kin.isNull { r.kin.revision = JS(r.kin.revision.asNumber + 1) }
        if !r.life.isNull { r.life.revision = JS(r.life.revision.asNumber + 1) }
    }

    // MARK: - 内部构建与写入辅助

    static func serializePerson(_ spec: HistoricalPersonSpec) -> JS {
        let o = JS.object()
        o.name = JS(spec.name)
        o.surname = JS(spec.surname)
        o.given = JS(spec.given)
        o.title = JS(spec.title)
        o.age = JS(spec.age)
        o.gender = JS(spec.gender)
        o.military = JS(spec.military)
        o.administrative = JS(spec.administrative)
        o.diplomatic = JS(spec.diplomatic)
        o.charisma = JS(spec.charisma)
        o.traits = .array(spec.traits.map { JS($0) })
        o.role = JS(spec.role)
        o.relationNote = JS(spec.relationNote)
        o.personId = JS(0)
        return o
    }

    static func setBirthForAge(_ r: JS, _ p: JS, age: Int) {
        let clamped = max(16, min(72, age))
        let spd = max(1.0, r.life.secondsPerDay.optionalNumber ?? 86400.0)
        let nowTime = r.life.gameTime.optionalNumber ?? 0.0
        let birth = Native.fr(nowTime - (Double(clamped) * 365.25 + 60.0) * spd)
        p.birthTime = JS(birth)
        let calc = People.yearSince(r, birth)
        p.age = JS(calc > 0 ? calc : clamped)
        let key = String(p.id.asInt)
        if !r.life.isNull && !r.life.persons.isNull {
            let lp = r.life.persons[key]
            if lp.isNull {
                let nl = JS.object()
                nl.source = JS("historical-roster")
                nl.birthTime = p.birthTime.clone()
                nl.age = p.age.clone()
                nl.initialAge = p.age.clone()
                nl.updatedMonth = r.life.lastAgeMonth.isNull ? JS(0) : r.life.lastAgeMonth.clone()
                r.life.persons[key] = nl
            } else {
                lp.birthTime = p.birthTime.clone()
                lp.age = p.age.clone()
            }
        }
    }

    private static func allocatePersonId(_ r: JS) -> Int {
        var next = r.people.isNull ? 1 : max(1, r.people.nextPersonId.asInt)
        if !r.kin.isNull && !r.kin.persons.isNull {
            while !r.kin.persons[String(next)].isNull { next += 1 }
        }
        if !r.people.isNull { r.people.nextPersonId = JS(next + 1) }
        return next
    }

    private static func allocateFamilyId(_ r: JS) -> Int {
        var maxId = 0
        if !r.kin.isNull && !r.kin.families.isNull {
            for (k, v) in r.kin.families.objectEntries {
                maxId = max(maxId, max(Int(k) ?? 0, v.id.asInt))
            }
        }
        let next = maxId + 1
        if !r.people.isNull && r.people.nextStateId.asInt <= next {
            r.people.nextStateId = JS(next + 1)
        }
        return next
    }

    private static func resolveFamilyId(_ r: JS, nationId: String, stateId: Int, surname: String) -> Int {
        if !surname.isEmpty, !r.nobility.isNull, !r.nobility.families.isNull {
            for (k, fam) in r.nobility.families.objectEntries where fam.nationId.optionalString == nationId {
                let kf = r.kin.families[k]
                if !kf.isNull && kf.surname.optionalString == surname {
                    return Int(k) ?? kf.id.asInt
                }
            }
        }
        let ruling = People.rulingFamilyId(r, nationId)
        if ruling > 0 { return ruling }
        return stateId
    }

    static func materializePerson(
        _ r: JS,
        specJS: JS,
        nationId: String,
        stateId: Int,
        familyId: Int,
        culture: String,
        religion: String,
        polity: String
    ) -> JS {
        let pid = allocatePersonId(r)
        let name = specJS.name.optionalString ?? "无名"
        let surname = specJS.surname.optionalString ?? ""
        let given = specJS.given.optionalString ?? name
        let title = specJS.title.optionalString ?? ""
        let age = max(18, min(68, specJS.age.optionalNumber.map(Int.init) ?? 35))
        let gender = specJS.gender.optionalNumber.map(Int.init) ?? 0
        let mil = max(10, min(100, specJS.military.optionalNumber.map(Int.init) ?? 65))
        let adm = max(10, min(100, specJS.administrative.optionalNumber.map(Int.init) ?? 65))
        let dip = max(10, min(100, specJS.diplomatic.optionalNumber.map(Int.init) ?? 65))
        let cha = max(10, min(100, specJS.charisma.optionalNumber.map(Int.init) ?? 65))
        let traitsArr = specJS.traits.isArray ? specJS.traits.asArray.compactMap(\.optionalString) : []
        let relNote = specJS.relationNote.optionalString ?? ""

        let p = JS.object()
        p.id = JS(pid)
        p.firstName = JS(given)
        p.lastName = JS(surname)
        p.cultureName = JS(culture)
        p.gender = JS(gender)
        p.age = JS(age)
        p.birthTime = JS(0)
        p.deathTime = JS(0)
        p.isAlive = JS(true)
        p.isHistoricallyImportant = JS(true)
        p.familyId = JS(familyId)
        p.originalFamilyId = JS(familyId)
        p.stateId = JS(stateId)
        p.religionId = JS(religion)
        p.fatherId = JS(0)
        p.motherId = JS(0)
        p.spouseId = JS(0)
        p.marriageType = JS(0)
        p.source = JS("historical-roster")
        p.initialAge = JS(age)
        if !title.isEmpty { p.historicalTitle = JS(title) }
        if !relNote.isEmpty { p.relationNote = JS(relNote) }

        let base = JS.object()
        base.military = JS(mil)
        base.administrative = JS(adm)
        base.diplomatic = JS(dip)
        base.charisma = JS(cha)
        p.base = base
        p.traits = .array(traitsArr.map { JS($0) })
        p.childrenIds = .array()
        p.roles = .array()
        p.pastRoles = .array()

        let ident = JS.object()
        ident.cultureId = JS(culture)
        ident.given = JS(given)
        ident.house = JS(surname)
        ident.gender = JS(gender)
        ident.name = JS(name)
        ident.regnalName = JS(given)
        ident.polityAtAccession = JS(polity)
        ident.religionId = JS(religion)
        if !title.isEmpty { ident.titleAtAccession = JS(title) }
        ident.mode = JS("historical-roster")
        ident.sourceKey = JS("person/\(culture)/historical/\(pid)")
        p.identity = ident

        setBirthForAge(r, p, age: age)

        let key = String(pid)
        if !r.kin.isNull && !r.kin.persons.isNull {
            r.kin.persons[key] = p
        }
        if !r.people.isNull && !r.people.persons.isNull {
            let pp = JS.object()
            pp.id = JS(pid)
            pp.stateId = JS(stateId)
            pp.nationId = JS(nationId)
            pp.rulerId = .null
            pp.name = JS(name)
            pp.family = JS(surname)
            pp.alive = JS(true)
            pp.recordedDay = r.world.day.clone()
            pp.base = base.clone()
            pp.traits = p.traits.clone()
            r.people.persons[key] = pp
        }
        if familyId > 0, !r.kin.isNull, !r.kin.families[String(familyId)].isNull {
            let fam = r.kin.families[String(familyId)]
            if fam.memberIds.isNull { fam.memberIds = .array() }
            if !fam.memberIds.asArray.contains(where: { $0.asInt == pid }) {
                fam.memberIds.push(JS(pid))
            }
        }
        return p
    }

    private static func applyFounder(
        _ r: JS,
        nationId: String,
        stateId: Int,
        rulingFamilyId: Int,
        culture: String,
        religion: String,
        polity: String,
        spec: HistoricalPersonSpec,
        power: HistoricalPowerSpec,
        nowDay: Double,
        fixedEraName: String? = nil
    ) -> Int {
        let lid = r.people.isNull ? 0 : (r.people.nations[nationId].leaderId.optionalNumber.map(Int.init) ?? 0)
        var person = lid > 0 ? People.person(r, lid) : nil
        if person == nil {
            let created = materializePerson(
                r,
                specJS: serializePerson(spec),
                nationId: nationId,
                stateId: stateId,
                familyId: rulingFamilyId > 0 ? rulingFamilyId : stateId,
                culture: culture,
                religion: religion,
                polity: polity
            )
            person = created
            if !r.people.isNull { r.people.nations[nationId].leaderId = created.id.clone() }
        }
        guard let p = person else { return 0 }
        let pid = p.id.asInt
        let pidKey = String(pid)

        p.firstName = JS(spec.given)
        p.lastName = JS(spec.surname)
        p.gender = JS(spec.gender)
        p.cultureName = JS(culture)
        p.religionId = JS(religion)
        p.isAlive = JS(true)
        p.isHistoricallyImportant = JS(true)
        p.historicalTitle = JS(spec.title)
        if !spec.relationNote.isEmpty { p.relationNote = JS(spec.relationNote) }
        if rulingFamilyId > 0 {
            p.familyId = JS(rulingFamilyId)
            p.originalFamilyId = JS(rulingFamilyId)
            let rFam = r.kin.families[String(rulingFamilyId)]
            if !rFam.isNull {
                rFam.headId = JS(pid)
                if !rFam.memberIds.asArray.contains(where: { $0.asInt == pid }) {
                    rFam.memberIds.push(JS(pid))
                }
            }
        }

        if p.base.isNull { p.base = .object() }
        p.base.military = JS(spec.military)
        p.base.administrative = JS(spec.administrative)
        p.base.diplomatic = JS(spec.diplomatic)
        p.base.charisma = JS(spec.charisma)
        p.traits = .array(spec.traits.map { JS($0) })
        setBirthForAge(r, p, age: spec.age)

        let ident = p.identity.isNull ? JS.object() : p.identity
        ident.cultureId = JS(culture)
        ident.given = JS(spec.given)
        ident.house = JS(spec.surname)
        ident.gender = JS(spec.gender)
        ident.name = JS(spec.name)
        ident.regnalName = JS(spec.given)
        ident.polityAtAccession = JS(polity)
        ident.religionId = JS(religion)
        ident.titleAtAccession = JS(spec.title)
        ident.mode = JS("historical-roster")
        p.identity = ident

        if p.roles.isArray {
            var updated = false
            for role in p.roles.asArray where role.nativeKind.optionalString == "leader" {
                role.title = JS(spec.title)
                role.stateId = JS(stateId)
                updated = true
            }
            if !updated {
                p.roles.push(People.leaderRole(r, p, title: spec.title))
            }
        } else {
            p.roles = .array([People.leaderRole(r, p, title: spec.title)])
        }

        if !r.people.isNull && !r.people.persons.isNull {
            let pp = r.people.persons[pidKey]
            if !pp.isNull {
                pp.name = JS(spec.name)
                pp.family = JS(spec.surname)
                pp.alive = JS(true)
                pp.base = p.base.clone()
                pp.traits = p.traits.clone()
            }
        }

        let termDays = Double(power.isLifetimeRuler ? 40 : max(4, power.termYears)) * 365.0
        if !r.chronicle.isNull && !r.chronicle.leaders.isNull {
            let hist = r.chronicle.leaders[nationId]
            if hist.isArray, let reign = hist.asArray.last {
                reign.name = JS(spec.name)
                reign.family = JS(spec.surname)
                reign.regnalName = JS(spec.given)
                reign.endedDay = .null
                reign.termEndDay = JS(nowDay + termDays)
                if let rid = reign.id.optionalString, !r.civilization.isNull && !r.civilization.rulers.isNull {
                    r.civilization.rulers[rid] = ident.clone()
                    if !r.sovereignty.isNull && !r.sovereignty.reigns.isNull {
                        r.sovereignty.reigns[rid] = JS(pid)
                    }
                    if let eraName = fixedEraName, !eraName.isEmpty, !r.regimes.isNull {
                        if r.regimes.reignLore.isNull { r.regimes.reignLore = .object() }
                        let loreKey = "\(nationId)|\(rid)"
                        let lore = r.regimes.reignLore[loreKey].isNull ? JS.object() : r.regimes.reignLore[loreKey]
                        lore.era = JS(eraName)
                        r.regimes.reignLore[loreKey] = lore
                    }
                }
            }
        }

        // 同步开篇史册条目的领袖姓名
        if !r.chronicle.isNull && r.chronicle.entries.isArray {
            for e in r.chronicle.entries.asArray where e.kind.optionalString == "founding" {
                if e.nationIds.isArray && e.nationIds.asArray.contains(where: { $0.optionalString == nationId }) {
                    if e.people.isArray && e.people.length > 0 {
                        e.people[0].name = JS(spec.name)
                        e.people[0].regnalName = JS(spec.given)
                    }
                }
            }
        }

        return pid
    }

    /// 将非史实随机生成的家族/旁系/配偶成员 100% 重塑为本国纯正文化姓名，彻底根治「日本派系里混进外国人」问题。
    private static func relocalizeMember(
        _ r: JS,
        personId mid: Int,
        culture: String,
        religion: String,
        familySurname: String,
        isImperialNoSurname: Bool,
        seed: String
    ) {
        guard let m = People.person(r, mid) else { return }
        if m.source.optionalString == "historical-roster" || m.isHistoricallyImportant.isTruthy {
            m.cultureName = JS(culture)
            m.religionId = JS(religion)
            return
        }
        let gender = m.gender.asInt == 1 ? 1 : 0
        let givenPool = NamingCatalog.givenNames(r, culture: culture, gender: gender)
        let housePool = NamingCatalog.houseNames(culture: culture)
        let h1 = Opening.hash("\(seed)|g|\(mid)")
        let h2 = Opening.hash("\(seed)|h|\(mid)")
        let newGiven: String = {
            if isImperialNoSurname && culture == "japanese" && m.natalSurname.isNull {
                return MonarchLore.japaneseImperialGivenName(seed: "\(seed)|imp|\(mid)", female: gender == 1)
            }
            if !givenPool.isEmpty { return givenPool[Int(h1 % UInt32(givenPool.count))] }
            return m.firstName.optionalString ?? "明"
        }()
        let isMarriedInSpouse = !m.natalSurname.isNull
        let nativeHouse: String = {
            if isMarriedInSpouse {
                if !housePool.isEmpty { return housePool[Int(h2 % UInt32(housePool.count))] }
                return familySurname
            }
            if isImperialNoSurname { return "" }
            if !familySurname.isEmpty { return familySurname }
            return housePool.isEmpty ? "" : housePool[Int(h2 % UInt32(housePool.count))]
        }()
        let fullName = NamingCatalog.formatPerson(culture: culture, given: newGiven, house: nativeHouse, gender: gender)
        m.firstName = JS(newGiven)
        m.lastName = JS(nativeHouse)
        if isMarriedInSpouse { m.natalSurname = JS(nativeHouse) }
        m.cultureName = JS(culture)
        m.religionId = JS(religion)
        let ident = m.identity.isNull ? JS.object() : m.identity
        ident.cultureId = JS(culture)
        ident.given = JS(newGiven)
        ident.house = JS(nativeHouse)
        ident.gender = JS(gender)
        ident.name = JS(fullName)
        ident.religionId = JS(religion)
        m.identity = ident
        if !r.people.isNull && !r.people.persons.isNull {
            let pp = r.people.persons[String(mid)]
            if !pp.isNull {
                pp.name = JS(fullName)
                pp.family = JS(nativeHouse)
            }
        }
    }

    private static func applyFamilies(
        _ r: JS,
        nationId: String,
        stateId: Int,
        culture: String,
        religion: String,
        specs: [HistoricalFamilySpec],
        relations: [HistoricalFamilyRelationSpec] = [],
        provinces: [JS]
    ) -> (rulingId: Int, bySurname: [String: Int], allIds: [Int]) {
        guard !r.nobility.isNull, !r.nobility.families.isNull, !r.kin.isNull, !r.kin.families.isNull else {
            return (stateId, [:], [stateId])
        }
        let rulingId = People.rulingFamilyId(r, nationId)
        let rulingKey = String(rulingId)
        let ownedProvIds = provinces.filter { $0.controller.optionalString == nationId }.map(\.id.asString)
        let fallbackHome = ownedProvIds.first ?? "p-0"
        let seed = r.world.custom.seed.optionalString ?? nationId

        let existingNonRuling = r.nobility.families.objectEntries
            .filter { $0.1.nationId.optionalString == nationId && $0.0 != rulingKey && !r.kin.families[$0.0].isNull }
            .sorted { ($0.1.influence.optionalNumber ?? 0) > ($1.1.influence.optionalNumber ?? 0) }
            .map { $0.0 }

        var bySurname = [String: Int]()
        var byLabel = [String: String]()
        var keyBySurname = [String: String]()
        var allIds = [Int]()
        var assignedRelations = [(String, Int)]()

        let rulingSpec = specs.first(where: { $0.isRuling }) ?? specs.first
        if rulingId > 0, !r.kin.families[rulingKey].isNull, let rs = rulingSpec {
            let kf = r.kin.families[rulingKey]
            let isJPImperial = culture == "japanese" && (rs.surname.isEmpty || rs.label.contains("皇室"))
            kf.surname = JS(rs.surname)
            kf.label = JS(rs.label)
            kf.cultureName = JS(culture)
            if !r.nobility.families[rulingKey].isNull {
                let nf = r.nobility.families[rulingKey]
                nf.influence = JS(max(35, rs.influence))
                nf.ruling = JS(true)
                nf.religionId = JS(religion)
                nf.label = JS(rs.label)
            }
            r.nobility.rulingFamilies[nationId] = JS(rulingId)
            if !rs.surname.isEmpty {
                bySurname[rs.surname] = rulingId
                keyBySurname[rs.surname] = rulingKey
            }
            if !rs.label.isEmpty { byLabel[rs.label] = rulingKey }
            allIds.append(rulingId)
            // 100% 清洗并本土文化化宗室全部直系、配偶与旁系成员，绝不残留任何异族名字
            for mid in People.ids(kf.memberIds) + People.ids(kf.collateralMemberIds) {
                relocalizeMember(r, personId: mid, culture: culture, religion: religion, familySurname: rs.surname, isImperialNoSurname: isJPImperial, seed: "\(seed)/\(rulingKey)")
            }
        }

        let nonRulingSpecs = specs.filter { !$0.isRuling }
        for (idx, fs) in nonRulingSpecs.enumerated() {
            let famKey: String
            let famId: Int
            if idx < existingNonRuling.count {
                famKey = existingNonRuling[idx]
                famId = Int(famKey) ?? 0
            } else {
                famId = allocateFamilyId(r)
                famKey = String(famId)
                let kf = JS.object()
                kf.id = JS(famId)
                kf.surname = JS(fs.surname)
                kf.label = JS(fs.label)
                kf.cultureName = JS(culture)
                kf.nationId = JS(nationId)
                kf.stateId = JS(stateId)
                kf.headId = JS(0)
                kf.heirId = JS(0)
                kf.allowFemaleInheritance = JS(false)
                kf.memberIds = .array()
                kf.collateralMemberIds = .array()
                r.kin.families[famKey] = kf

                let homeProv = ownedProvIds.isEmpty ? fallbackHome : ownedProvIds[idx % ownedProvIds.count]
                let nf = JS.object()
                nf.nationId = JS(nationId)
                nf.ruling = JS(false)
                nf.homeProvinceId = JS(homeProv)
                nf.originalHomeProvinceId = JS(homeProv)
                nf.controlledProvinces = .array()
                nf.influence = JS(max(18, fs.influence))
                nf.wealth = JS(120)
                nf.extendedMembers = JS(35)
                nf.religionId = JS(religion)
                nf.foundingTime = JS(0)
                nf.updateDay = JS(1)
                nf.totalEnemyDestroyed = JS(0)
                nf.totalProvincesConquered = JS(0)
                nf.rallyCooldown = JS(0)
                nf.historicalClaims = .object()
                nf.historicalStateIds = .array()
                nf.lastRulingTime = .object()
                nf.rulingDuration = .object()
                nf.stateResidenceMonths = .object()
                nf.label = JS(fs.label)
                r.nobility.families[famKey] = nf
            }

            let kf = r.kin.families[famKey]
            let nf = r.nobility.families[famKey]
            if !kf.isNull {
                kf.surname = JS(fs.surname)
                kf.label = JS(fs.label)
                kf.cultureName = JS(culture)
                for mid in People.ids(kf.memberIds) + People.ids(kf.collateralMemberIds) {
                    relocalizeMember(r, personId: mid, culture: culture, religion: religion, familySurname: fs.surname, isImperialNoSurname: false, seed: "\(seed)/\(famKey)")
                }
            }
            if !nf.isNull {
                nf.influence = JS(max(18, fs.influence))
                nf.ruling = JS(false)
                nf.religionId = JS(religion)
                nf.label = JS(fs.label)
            }
            if famId > 0 {
                if !fs.surname.isEmpty {
                    bySurname[fs.surname] = famId
                    keyBySurname[fs.surname] = famKey
                }
                if !fs.label.isEmpty { byLabel[fs.label] = famKey }
                allIds.append(famId)
                assignedRelations.append((famKey, fs.relationToRuler))
            }
        }

        // 彻底清除多余的随机生成家族及其孤立成员，并把封地归还宗室（根治历史大国凭空冒出陌生异族家族的问题）
        if nonRulingSpecs.count < existingNonRuling.count {
            let rulingNoble = r.nobility.families[rulingKey]
            let leaderPid = r.people.isNull ? -1 : (r.people.nations[nationId].leaderId.optionalNumber.map(Int.init) ?? -1)
            for extraKey in existingNonRuling[nonRulingSpecs.count...] {
                if let nf = r.nobility.families[extraKey].isNull ? nil : r.nobility.families[extraKey], !rulingNoble.isNull {
                    for prov in nf.controlledProvinces.asArray {
                        if !rulingNoble.controlledProvinces.asArray.contains(where: { $0.asString == prov.asString }) {
                            rulingNoble.controlledProvinces.push(prov.clone())
                        }
                    }
                }
                let kf = r.kin.families[extraKey]
                if !kf.isNull {
                    for mid in People.ids(kf.memberIds) + People.ids(kf.collateralMemberIds) where mid != leaderPid {
                        let mKey = String(mid)
                        if let person = People.person(r, mid), person.isHistoricallyImportant.isTruthy { continue }
                        r.kin.persons.delete(mKey)
                        if !r.people.isNull && !r.people.persons.isNull { r.people.persons.delete(mKey) }
                        if !r.life.isNull && !r.life.persons.isNull { r.life.persons.delete(mKey) }
                    }
                }
                r.kin.families.delete(extraKey)
                r.nobility.families.delete(extraKey)
                if !r.nobility.relations.isNull {
                    r.nobility.relations.delete(extraKey)
                    for (_, row) in r.nobility.relations.objectEntries {
                        row.delete(extraKey)
                    }
                }
            }
        }

        // 设置与宗室/中央的对称家族关系，并写入历史剧本专属的派系宿怨与同盟（如二战日本陆海对立 −48）
        if r.nobility.relations.isNull { r.nobility.relations = .object() }
        if rulingId > 0 {
            if r.nobility.relations[rulingKey].isNull { r.nobility.relations[rulingKey] = .object() }
            for (fk, relVal) in assignedRelations where fk != rulingKey {
                let safeRel = Double(max(20, min(90, relVal)))
                if r.nobility.relations[fk].isNull { r.nobility.relations[fk] = .object() }
                r.nobility.relations[fk][rulingKey] = JS(safeRel)
                r.nobility.relations[rulingKey][fk] = JS(safeRel)
            }
        }
        for pair in relations {
            guard let ka = keyBySurname[pair.surnameA] ?? byLabel[pair.surnameA],
                  let kb = keyBySurname[pair.surnameB] ?? byLabel[pair.surnameB],
                  ka != kb else { continue }
            let val = Double(max(-85, min(90, pair.relation)))
            if r.nobility.relations[ka].isNull { r.nobility.relations[ka] = .object() }
            if r.nobility.relations[kb].isNull { r.nobility.relations[kb] = .object() }
            r.nobility.relations[ka][kb] = JS(val)
            r.nobility.relations[kb][ka] = JS(val)
        }
        let curMonth = r.nobility.month.isNull ? JS(0) : r.nobility.month.clone()
        if r.nobility.lastFamilyRebellion.isNull { r.nobility.lastFamilyRebellion = .object() }
        if r.nobility.lastCivilWar.isNull { r.nobility.lastCivilWar = .object() }
        r.nobility.lastFamilyRebellion[nationId] = curMonth
        r.nobility.lastCivilWar[nationId] = curMonth

        return (rulingId, bySurname, allIds)
    }

    private static func applyParties(_ r: JS, nationId: String, book: JS, specs: [HistoricalPartySpec]) {
        guard !specs.isEmpty else { return }
        let rawSum = specs.reduce(0) { $0 + max(1, $1.seats) }
        var normalized = specs.map { (name: $0.name, seats: max(1, Int((Double(max(1, $0.seats)) / Double(max(1, rawSum)) * 100.0).rounded()))) }
        let diff = 100 - normalized.reduce(0) { $0 + $1.seats }
        if !normalized.isEmpty {
            normalized[0].seats = max(1, normalized[0].seats + diff)
        }
        book.parties = .array(normalized.map { item in
            let o = JS.object()
            o.name = JS(item.name)
            o.seats = JS(item.seats)
            return o
        })
        book.historicalPartiesLocked = JS(true)
    }

    private static func applyNotablesAndOffices(
        _ r: JS,
        nationId: String,
        stateId: Int,
        rulingFamilyId: Int,
        familyIdBySurname: [String: Int],
        allFamilyIds: [Int],
        culture: String,
        religion: String,
        polity: String,
        book: JS,
        notables: [HistoricalPersonSpec],
        provinces: [JS]
    ) -> (byName: [String: Int], admirals: [JS]) {
        var byName = [String: Int]()
        var admirals = [JS]()
        var createdList = [(spec: HistoricalPersonSpec, person: JS)]()

        for (idx, spec) in notables.enumerated() {
            let famId: Int = {
                if let direct = familyIdBySurname[spec.surname] { return direct }
                if !allFamilyIds.isEmpty {
                    let nonRuling = allFamilyIds.filter { $0 != rulingFamilyId }
                    if !nonRuling.isEmpty { return nonRuling[idx % nonRuling.count] }
                    return allFamilyIds[0]
                }
                return rulingFamilyId > 0 ? rulingFamilyId : stateId
            }()
            let p = materializePerson(
                r,
                specJS: serializePerson(spec),
                nationId: nationId,
                stateId: stateId,
                familyId: famId,
                culture: culture,
                religion: religion,
                polity: polity
            )
            let pid = p.id.asInt
            byName[spec.name] = pid
            createdList.append((spec, p))

            // 若所在非宗室世家尚无家主，让该家族首位名臣出任家主
            if famId > 0 && famId != rulingFamilyId, !r.kin.isNull {
                let kf = r.kin.families[String(famId)]
                if !kf.isNull && kf.headId.asInt <= 0 {
                    kf.headId = JS(pid)
                }
            }
        }

        // 写入朝堂 posts 与合法的 r.offices47 官职（仅使用 Offices.defs 的 5 个合法键）
        if book.posts.isNull { book.posts = .object() }
        let officeBook = r.offices47.isNull ? JS.null : Offices.book(r, nationId)
        if !officeBook.isNull {
            officeBook.assignments = .array()
        }
        let ctx = Offices.context(r, nationId)
        let activeWars = Offices.wars(r, nationId)
        let ownedProvIndices = provinces.enumerated().compactMap { $0.element.controller.optionalString == nationId ? $0.offset + 1 : nil }

        var chancellorFilled = false
        var stewardFilled = false
        var marshalFilled = false
        var centralHolders = Set<Int>()
        var governorHolders = Set<Int>()
        var warCmdIndex = 0
        var govProvIndex = 0
        var extraGuardSet = false
        var extraFrontierSet = false

        func assignCentral(_ office: String, _ pid: Int) -> Bool {
            guard !officeBook.isNull, !centralHolders.contains(pid), !governorHolders.contains(pid) else { return false }
            Offices.appoint(ctx, office, 0, stateId, pid)
            centralHolders.insert(pid)
            return true
        }
        func assignGovernor(_ pid: Int) {
            guard !officeBook.isNull, !centralHolders.contains(pid), !governorHolders.contains(pid), govProvIndex < ownedProvIndices.count else { return }
            let scopeId = ownedProvIndices[govProvIndex]
            govProvIndex += 1
            Offices.appoint(ctx, "Governor", 1, scopeId, pid)
            governorHolders.insert(pid)
        }

        // 第一轮：优先就位中央三公（Chancellor / Steward / Marshal）与战区统帅（WarCommander）与提督
        for (spec, p) in createdList {
            let pid = p.id.asInt
            switch spec.role {
            case "Chancellor":
                if !chancellorFilled && assignCentral("Chancellor", pid) {
                    chancellorFilled = true
                    book.posts["personnel"] = JS(pid)
                    book.premierSeen = JS(pid)
                } else if !stewardFilled && assignCentral("Steward", pid) {
                    stewardFilled = true
                    book.posts["revenue"] = JS(pid)
                } else {
                    assignGovernor(pid)
                }
            case "Treasurer":
                if !stewardFilled && assignCentral("Steward", pid) {
                    stewardFilled = true
                    book.posts["revenue"] = JS(pid)
                    book.posts["treasury"] = JS(pid)
                } else if !chancellorFilled && assignCentral("Chancellor", pid) {
                    chancellorFilled = true
                    book.posts["personnel"] = JS(pid)
                } else {
                    assignGovernor(pid)
                }
            case "WarCommander":
                if !marshalFilled && assignCentral("Marshal", pid) {
                    marshalFilled = true
                    book.posts["war"] = JS(pid)
                } else {
                    if !extraGuardSet { book.posts["guard"] = JS(pid); extraGuardSet = true }
                    else if !extraFrontierSet { book.posts["frontier"] = JS(pid); extraFrontierSet = true }
                    assignGovernor(pid)
                }
                if !officeBook.isNull && warCmdIndex < activeWars.count {
                    Offices.appoint(ctx, "WarCommander", 2, activeWars[warCmdIndex].scopeId, pid)
                    warCmdIndex += 1
                }
            case "Admiral":
                let skill = SeaDominion.AdmiralSkill.pick(traits: spec.traits, military: Double(spec.military), seed: pid)
                let bonus = max(10, min(35, Int((Double(spec.military) - 55.0) * 0.65 + 14.0)))
                let adm = JS.object()
                adm.name = JS(spec.name)
                adm.personId = JS(pid)
                adm.military = JS(spec.military)
                adm.skill = JS(skill.rawValue)
                adm.bonus = JS(bonus)
                adm.title = JS(spec.title)
                admirals.append(adm)
                if book.posts["admiral"].isNull { book.posts["admiral"] = JS(pid) }
                if !marshalFilled && assignCentral("Marshal", pid) {
                    marshalFilled = true
                    book.posts["war"] = JS(pid)
                } else {
                    assignGovernor(pid)
                }
            case "Diplomat":
                if book.posts["rites"].isNull { book.posts["rites"] = JS(pid) }
                if book.posts["envoy"].isNull { book.posts["envoy"] = JS(pid) }
                if !chancellorFilled && assignCentral("Chancellor", pid) {
                    chancellorFilled = true
                    book.posts["personnel"] = JS(pid)
                } else if !stewardFilled && assignCentral("Steward", pid) {
                    stewardFilled = true
                    book.posts["revenue"] = JS(pid)
                } else {
                    assignGovernor(pid)
                }
            default:
                assignGovernor(pid)
            }
        }

        // 第二轮：若中央三公仍有空位，从未任中央官的名臣中按适配度补齐
        if !chancellorFilled, let cand = createdList.first(where: { !centralHolders.contains($0.person.id.asInt) && !governorHolders.contains($0.person.id.asInt) }) {
            if assignCentral("Chancellor", cand.person.id.asInt) {
                chancellorFilled = true
                book.posts["personnel"] = cand.person.id.clone()
            }
        }
        if !stewardFilled, let cand = createdList.first(where: { !centralHolders.contains($0.person.id.asInt) && !governorHolders.contains($0.person.id.asInt) }) {
            if assignCentral("Steward", cand.person.id.asInt) {
                stewardFilled = true
                book.posts["revenue"] = cand.person.id.clone()
            }
        }
        if !marshalFilled, let cand = createdList.first(where: { !centralHolders.contains($0.person.id.asInt) && !governorHolders.contains($0.person.id.asInt) }) {
            if assignCentral("Marshal", cand.person.id.asInt) {
                marshalFilled = true
                book.posts["war"] = cand.person.id.clone()
            }
        }

        return (byName, admirals)
    }

    private static func attachAdmiralsToExistingFleets(_ r: JS, nationId: String, admirals: [JS]) {
        guard !admirals.isEmpty else { return }
        let fleets = Naval.fleets(r).filter { $0.nationId.optionalString == nationId && $0.status.optionalString != "lost" }
        guard !fleets.isEmpty else { return }
        for (idx, fl) in fleets.enumerated() {
            let adm = admirals[idx % admirals.count]
            _ = MaritimeWarfare.fleetMeta(r, fleet: fl)
            let fid = fl.id.asString
            let rec = r.regimes.fleetMeta[fid]
            if !rec.isNull {
                rec.admiralName = adm.name.clone()
                rec.admiralBonus = adm.bonus.clone()
                rec.admiralSkill = adm.skill.clone()
            }
        }
    }

    // MARK: - 紧凑工厂辅助（避免 Swift 5.10 类型推断超时）

    private static func p(
        _ name: String,
        _ surname: String,
        _ given: String,
        _ title: String,
        _ age: Int,
        _ mil: Int,
        _ adm: Int,
        _ dip: Int,
        _ cha: Int,
        _ traits: [String],
        _ role: String,
        _ note: String,
        gender: Int = 0
    ) -> HistoricalPersonSpec {
        HistoricalPersonSpec(
            name: name, surname: surname, given: given, title: title, age: age, gender: gender,
            military: mil, administrative: adm, diplomatic: dip, charisma: cha,
            traits: traits, role: role, relationNote: note
        )
    }

    private static func f(_ surname: String, _ label: String, _ influence: Int, _ rel: Int = 50, ruling: Bool = false) -> HistoricalFamilySpec {
        HistoricalFamilySpec(surname: surname, label: label, influence: influence, relationToRuler: rel, isRuling: ruling)
    }

    private static func pt(_ name: String, _ seats: Int) -> HistoricalPartySpec {
        HistoricalPartySpec(name: name, seats: seats)
    }

    private static func pw(
        ind: Double,
        mp: Double,
        mil: Int,
        eco: Int,
        sta: Int,
        nav: Int,
        fleets: Int = 0,
        ships: Int = 4,
        navBonus: Double = 0.0,
        traits: [String] = [],
        lifetime: Bool = true,
        term: Int = 4,
        nukes: Int = 0,
        nucProg: Double = 0.0,
        reactors: Int = 0,
        warSupport: Double = 58.0,
        startArmies: Int? = nil,
        maxArmies: Int? = nil
    ) -> HistoricalPowerSpec {
        HistoricalPowerSpec(
            industryIndex: ind, manpowerScale: mp, techMil: mil, techEco: eco, techSta: sta, techNav: nav,
            fleetCount: fleets, shipsPerFleet: ships, navalPowerBonus: navBonus, stateTraits: traits,
            isLifetimeRuler: lifetime, termYears: term, startingNukes: nukes, nuclearProgress: nucProg,
            startingReactors: reactors, warSupport: warSupport,
            startingArmies: startArmies, maxArmies: maxArmies
        )
    }

    private static func n(
        _ idx: Int,
        founder: HistoricalPersonSpec,
        successors: [HistoricalPersonSpec],
        notables: [HistoricalPersonSpec],
        families: [HistoricalFamilySpec],
        parties: [HistoricalPartySpec],
        power: HistoricalPowerSpec,
        familyRelations: [HistoricalFamilyRelationSpec] = [],
        fixedEraName: String? = nil
    ) -> HistoricalNationRoster {
        HistoricalNationRoster(
            nationIndex: idx, founder: founder, successors: successors, notables: notables,
            families: families, parties: parties, power: power,
            familyRelations: familyRelations, fixedEraName: fixedEraName
        )
    }

    private static func fr(_ a: String, _ b: String, _ rel: Int) -> HistoricalFamilyRelationSpec {
        HistoricalFamilyRelationSpec(a, b, rel)
    }

    // MARK: - 剧本 1：战国七雄 · 长平风云（公元前 260 年，10 国）

    private static let zhanguo260bce: [HistoricalNationRoster] = [
        // 0 秦
        n(0,
          founder: p("嬴稷", "嬴", "稷", "秦昭襄王", 56, 86, 92, 85, 90, ["Ambitious", "IronFist", "Unifier", "Lawgiver"], "Ruler", "秦昭襄王"),
          successors: [
              p("嬴柱", "嬴", "柱", "秦孝文王", 42, 68, 76, 72, 74, ["Patient", "Administrator"], "Successor", "安国君·太子"),
              p("嬴子楚", "嬴", "子楚", "秦庄襄王", 32, 74, 80, 78, 82, ["Ambitious", "Diplomatic", "Reformer"], "Successor", "嫡长孙"),
              p("嬴政", "嬴", "政", "秦始皇", 22, 95, 99, 88, 96, ["Genius", "Unifier", "Conqueror", "IronFist", "Lawgiver"], "Successor", "千古一帝"),
          ],
          notables: [
              p("白起", "白", "起", "武安君", 48, 99, 72, 58, 88, ["Genius", "Strategist", "BattleHardened", "Conqueror"], "WarCommander", "首席上将·人屠"),
              p("范雎", "范", "雎", "应侯·丞相", 45, 62, 92, 95, 84, ["MasterDiplomat", "Administrator", "Visionary"], "Chancellor", "客卿丞相·远交近攻"),
              p("王龁", "王", "龁", "左庶长", 42, 86, 68, 60, 78, ["Brave", "BattleHardened", "Veteran"], "WarCommander", "长平副帅"),
              p("蒙骜", "蒙", "骜", "上卿", 46, 84, 70, 65, 80, ["BattleHardened", "Diligent", "Tactician"], "WarCommander", "蒙氏将门先祖"),
              p("魏冉", "芈", "冉", "穰侯", 54, 78, 84, 76, 80, ["Administrator", "Ambitious", "Financier"], "Treasurer", "宣太后异父弟"),
          ],
          families: [
              f("嬴", "嬴氏宗室", 92, 80, ruling: true),
              f("芈", "宣太后芈氏", 68, 52),
              f("范", "范氏客卿", 62, 64),
              f("蒙", "蒙氏将门", 58, 70),
          ],
          parties: [pt("法家变法派", 54), pt("宗室勋贵派", 28), pt("客卿纵横派", 18)],
          power: pw(ind: 2.2, mp: 1.85, mil: 5, eco: 4, sta: 5, nav: 1, fleets: 0, ships: 2, navBonus: 0.0,
                    traits: ["WellTrained", "FieldCombatElite", "Conqueror", "SiegeCapture"], lifetime: true, term: 40, warSupport: 86)
        ),
        // 1 赵
        n(1,
          founder: p("赵丹", "赵", "丹", "赵孝成王", 32, 74, 74, 76, 78, ["Brave", "Hawkish", "Stubborn"], "Ruler", "赵孝成王"),
          successors: [
              p("赵偃", "赵", "偃", "赵悼襄王", 28, 66, 64, 68, 66, ["Ambitious", "Stubborn"], "Successor", "公子·继任赵王"),
              p("赵迁", "赵", "迁", "幽缪王", 22, 54, 52, 58, 56, ["Paranoid", "Extravagant"], "Successor", "赵末代君主"),
          ],
          notables: [
              p("廉颇", "廉", "颇", "信平君·上卿", 56, 94, 72, 68, 90, ["Brave", "BattleHardened", "Veteran", "Patient"], "WarCommander", "战国四大名将"),
              p("李牧", "李", "牧", "武安君", 36, 96, 80, 74, 92, ["Genius", "Strategist", "Tactician", "BattleHardened"], "WarCommander", "北境战神"),
              p("蔺相如", "蔺", "相如", "上卿", 52, 64, 88, 95, 92, ["MasterDiplomat", "Just", "Patient", "Scholar"], "Diplomat", "完璧归赵·相国"),
              p("赵胜", "赵", "胜", "平原君", 48, 70, 82, 86, 90, ["Charismatic", "SocialButterfly", "Diplomatic"], "Chancellor", "战国四公子"),
              p("赵奢", "赵", "奢", "马服君", 50, 89, 82, 70, 84, ["Tactician", "Just", "Administrator"], "Treasurer", "阏与大捷名将"),
          ],
          families: [
              f("赵", "赵氏宗室", 86, 80, ruling: true),
              f("赵", "平原君赵胜府", 72, 66),
              f("廉", "廉氏将门", 64, 68),
              f("李", "李氏边将", 60, 72),
          ],
          parties: [pt("胡服骑射派", 46), pt("合纵抗秦派", 32), pt("宗室卿族派", 22)],
          power: pw(ind: 1.55, mp: 1.50, mil: 5, eco: 3, sta: 4, nav: 1, fleets: 0, ships: 2, navBonus: 0.0,
                    traits: ["CavalryTradition", "HomelandDefense", "FieldCombatElite"], lifetime: true, term: 40, warSupport: 80)
        ),
        // 2 齐
        n(2,
          founder: p("田建", "田", "建", "齐王建", 24, 56, 68, 72, 68, ["Dovish", "Patient", "Benevolent"], "Ruler", "田齐末主"),
          successors: [
              p("田假", "田", "假", "齐王", 32, 64, 66, 68, 66, ["Ambitious", "Diplomatic"], "Successor", "田氏宗室"),
              p("田儋", "田", "儋", "齐王", 36, 80, 72, 74, 82, ["Brave", "NaturalLeader"], "Successor", "田氏宗室豪杰"),
          ],
          notables: [
              p("田单", "田", "单", "安平君·相国", 48, 92, 84, 80, 88, ["Strategist", "Tactician", "BattleHardened"], "WarCommander", "火牛阵复齐名将"),
              p("后胜", "后", "胜", "齐相", 44, 48, 70, 76, 66, ["Financier", "Greedy", "Diplomatic"], "Chancellor", "齐国王舅相国"),
              p("貂勃", "貂", "勃", "大夫", 40, 56, 78, 82, 76, ["Scholar", "Just", "Diplomatic"], "Diplomat", "齐国直臣"),
          ],
          families: [
              f("田", "田氏宗室", 84, 80, ruling: true),
              f("田", "靖郭孟尝旧族", 62, 54),
              f("后", "后氏外戚", 56, 62),
          ],
          parties: [pt("重商渔盐派", 44), pt("田氏宗族派", 34), pt("稷下清议派", 22)],
          power: pw(ind: 1.85, mp: 1.35, mil: 3, eco: 5, sta: 4, nav: 2, fleets: 1, ships: 4, navBonus: 0.08,
                    traits: ["StrengthenCore", "CoreDefense"], lifetime: true, term: 40, warSupport: 52)
        ),
        // 3 楚
        n(3,
          founder: p("熊完", "熊", "完", "楚考烈王", 38, 72, 76, 78, 76, ["Patient", "Diplomatic", "Reformer"], "Ruler", "楚考烈王"),
          successors: [
              p("熊悍", "熊", "悍", "楚幽王", 24, 60, 66, 66, 68, ["Patient", "Benevolent"], "Successor", "嫡子"),
              p("熊负刍", "熊", "负刍", "楚王负刍", 30, 70, 68, 66, 72, ["Hawkish", "Ambitious"], "Successor", "楚宗室"),
          ],
          notables: [
              p("黄歇", "黄", "歇", "春申君·令尹", 50, 72, 89, 90, 91, ["Administrator", "MasterDiplomat", "Charismatic", "Financier"], "Chancellor", "战国四公子·令尹"),
              p("项燕", "项", "燕", "楚大将军", 38, 91, 70, 66, 86, ["Brave", "BattleHardened", "Tactician"], "WarCommander", "楚国柱石名将"),
              p("景阳", "景", "阳", "上柱国", 46, 82, 74, 72, 78, ["Veteran", "BattleHardened"], "WarCommander", "楚三闾将门"),
          ],
          families: [
              f("熊", "熊氏王族", 82, 80, ruling: true),
              f("屈", "屈景昭三族", 76, 56),
              f("黄", "黄氏春申府", 68, 72),
          ],
          parties: [pt("屈景昭旧族", 42), pt("春申门客派", 36), pt("抗秦主战派", 22)],
          power: pw(ind: 1.65, mp: 1.75, mil: 4, eco: 4, sta: 3, nav: 2, fleets: 1, ships: 4, navBonus: 0.06,
                    traits: ["HomelandDefense", "FightToTheEnd"], lifetime: true, term: 40, warSupport: 66)
        ),
        // 4 魏
        n(4,
          founder: p("魏圉", "魏", "圉", "魏安釐王", 44, 68, 74, 72, 72, ["Patient", "Paranoid", "Administrator"], "Ruler", "魏安釐王"),
          successors: [
              p("魏增", "魏", "增", "魏景湣王", 32, 66, 72, 70, 70, ["Patient", "Diligent"], "Successor", "太子"),
              p("魏假", "魏", "假", "魏王假", 26, 58, 64, 64, 62, ["Stubborn", "Just"], "Successor", "末代魏王"),
          ],
          notables: [
              p("魏无忌", "魏", "无忌", "信陵君", 42, 88, 86, 95, 96, ["Genius", "MasterDiplomat", "Charismatic", "Tactician", "Beloved"], "Chancellor", "窃符救赵·五国合纵帅"),
              p("晋鄙", "晋", "鄙", "魏上将军", 52, 82, 70, 62, 76, ["Veteran", "Patient", "Just"], "WarCommander", "邺城十万大军统帅"),
              p("朱亥", "朱", "亥", "客卿将领", 38, 85, 56, 60, 78, ["Brave", "BattleHardened"], "WarCommander", "信陵君门下壮士"),
          ],
          families: [
              f("魏", "魏氏宗室", 84, 80, ruling: true),
              f("魏", "信陵君魏无忌府", 74, 58),
              f("晋", "晋氏勋贵", 56, 64),
          ],
          parties: [pt("信陵义士派", 44), pt("魏宗室保守派", 36), pt("合纵连横派", 20)],
          power: pw(ind: 1.50, mp: 1.25, mil: 4, eco: 4, sta: 4, nav: 1, fleets: 0, ships: 2, navBonus: 0.0,
                    traits: ["WellTrained", "CoreDefense"], lifetime: true, term: 40, warSupport: 65)
        ),
        // 5 韩
        n(5,
          founder: p("韩然", "韩", "然", "韩桓惠王", 42, 62, 72, 74, 68, ["Patient", "Diplomatic", "Dovish"], "Ruler", "韩桓惠王"),
          successors: [
              p("韩安", "韩", "安", "韩王安", 26, 54, 64, 68, 62, ["Dovish", "Patient"], "Successor", "太子"),
          ],
          notables: [
              p("张平", "张", "平", "韩相", 44, 62, 84, 82, 78, ["Administrator", "Diplomatic", "Diligent"], "Chancellor", "五世相韩·张良之父"),
              p("韩非", "韩", "非", "公子·法家宗师", 26, 60, 95, 84, 82, ["Genius", "Scholar", "Lawgiver", "Visionary"], "Treasurer", "法家集大成者"),
              p("暴鸢", "暴", "鸢", "韩将", 46, 78, 66, 60, 70, ["Veteran", "Brave"], "WarCommander", "韩军宿将"),
          ],
          families: [
              f("韩", "韩氏宗室", 82, 80, ruling: true),
              f("张", "张氏相门", 66, 74),
          ],
          parties: [pt("法家申韩派", 56), pt("世卿旧贵派", 44)],
          power: pw(ind: 1.25, mp: 0.95, mil: 4, eco: 4, sta: 4, nav: 1, fleets: 0, ships: 2, navBonus: 0.0,
                    traits: ["CoreDefense", "WellTrained"], lifetime: true, term: 40, warSupport: 58)
        ),
        // 6 燕
        n(6,
          founder: p("姬喜", "姬", "喜", "燕王喜", 36, 66, 68, 70, 70, ["Ambitious", "Stubborn", "Hawkish"], "Ruler", "燕王喜"),
          successors: [
              p("姬丹", "姬", "丹", "燕太子丹", 24, 72, 74, 80, 84, ["Brave", "Ambitious", "Charismatic"], "Successor", "太子丹"),
          ],
          notables: [
              p("剧辛", "剧", "辛", "燕上将", 50, 82, 68, 66, 74, ["Veteran", "Hawkish"], "WarCommander", "燕国宿将"),
              p("栗腹", "栗", "腹", "燕相", 46, 72, 76, 64, 70, ["Ambitious", "Hawkish"], "Chancellor", "燕国相国"),
              p("乐间", "乐", "间", "昌国君", 42, 80, 76, 74, 78, ["Patient", "Just", "Tactician"], "WarCommander", "乐毅之子"),
          ],
          families: [
              f("姬", "姬氏燕宗", 84, 80, ruling: true),
              f("乐", "乐氏将门", 64, 62),
          ],
          parties: [pt("姬姓宗室派", 56), pt("复仇强军派", 44)],
          power: pw(ind: 1.15, mp: 1.05, mil: 3, eco: 3, sta: 3, nav: 1, fleets: 0, ships: 2, navBonus: 0.0,
                    traits: ["HomelandDefense", "DefyTheStrong"], lifetime: true, term: 40, warSupport: 64)
        ),
        // 7 匈奴
        n(7,
          founder: p("头曼", "挛鞮", "头曼", "单于", 48, 84, 68, 62, 82, ["Brave", "Hawkish", "BattleHardened"], "Ruler", "匈奴单于"),
          successors: [
              p("冒顿", "挛鞮", "冒顿", "冒顿单于", 28, 95, 86, 80, 94, ["Genius", "Conqueror", "IronFist", "Strategist", "Unifier"], "Successor", "鸣镝弑父·草原雄主"),
              p("稽粥", "挛鞮", "稽粥", "老上单于", 26, 86, 78, 72, 84, ["BattleHardened", "Hawkish"], "Successor", "冒顿之子"),
          ],
          notables: [
              p("左贤王", "挛鞮", "左贤王", "左贤王", 36, 86, 66, 62, 80, ["Brave", "BattleHardened"], "WarCommander", "东翼统帅"),
              p("右贤王", "挛鞮", "右贤王", "右贤王", 38, 84, 64, 60, 78, ["Hawkish", "Tactician"], "WarCommander", "西翼统帅"),
          ],
          families: [
              f("挛鞮", "挛鞮王庭", 86, 80, ruling: true),
              f("呼衍", "呼衍贵部", 62, 65),
              f("兰", "兰氏贵部", 58, 64),
          ],
          parties: [pt("单于王庭派", 62), pt("左右贤王部", 38)],
          power: pw(ind: 0.72, mp: 1.25, mil: 4, eco: 2, sta: 2, nav: 1, fleets: 0, ships: 2, navBonus: 0.0,
                    traits: ["CavalryTradition", "Conqueror", "FieldCombatElite"], lifetime: true, term: 40, warSupport: 82)
        ),
        // 8 百越
        n(8,
          founder: p("摇", "驺", "摇", "闽越王", 38, 78, 72, 74, 80, ["Brave", "NavalMastery", "NaturalLeader"], "Ruler", "勾践后裔·东瓯越首"),
          successors: [
              p("无诸", "驺", "无诸", "闽越王", 32, 80, 76, 76, 82, ["Brave", "Unifier", "ShipMaster"], "Successor", "闽越雄主"),
              p("赵佗", "赵", "佗", "南越武王", 30, 86, 90, 88, 90, ["Administrator", "Diplomatic", "Visionary", "Unifier"], "Successor", "南越开国之君"),
          ],
          notables: [
              p("译吁宋", "译", "吁宋", "西瓯君长", 42, 82, 66, 64, 78, ["Brave", "BattleHardened"], "WarCommander", "岭南百越猛将"),
              p("余善", "驺", "余善", "东越水师将", 34, 78, 68, 66, 76, ["NavalMastery", "ShipMaster"], "Admiral", "闽越楼船将领"),
          ],
          families: [
              f("驺", "驺氏越王族", 80, 80, ruling: true),
              f("译", "西瓯部族", 58, 62),
          ],
          parties: [pt("闽越水师派", 55), pt("部族长老派", 45)],
          power: pw(ind: 0.85, mp: 1.00, mil: 3, eco: 3, sta: 2, nav: 3, fleets: 2, ships: 4, navBonus: 0.14,
                    traits: ["HomelandDefense", "CoreDefense"], lifetime: true, term: 40, warSupport: 64)
        ),
        // 9 羌戎
        n(9,
          founder: p("研", "西羌", "研", "西羌大帅", 42, 82, 62, 60, 78, ["Brave", "BattleHardened", "Stubborn"], "Ruler", "研种羌豪帅"),
          successors: [
              p("留何", "西羌", "留何", "羌酋", 32, 78, 64, 62, 76, ["Brave", "Hawkish"], "Successor", "无弋爰剑后裔"),
              p("滇良", "西羌", "滇良", "烧当羌王", 28, 84, 68, 66, 82, ["NaturalLeader", "BattleHardened"], "Successor", "烧当羌统帅"),
          ],
          notables: [
              p("义渠残帅", "义渠", "戎帅", "西戎骑将", 44, 80, 58, 56, 74, ["BattleHardened", "Hawkish"], "WarCommander", "义渠故部猛将"),
              p("羌渠长老", "羌渠", "长老", "部族祭司", 50, 60, 72, 70, 76, ["Patient", "Just"], "Chancellor", "诸羌调停长老"),
          ],
          families: [
              f("西羌", "研种羌部", 78, 80, ruling: true),
              f("义渠", "义渠余部", 58, 60),
          ],
          parties: [pt("西羌部帅派", 60), pt("草原牧主派", 40)],
          power: pw(ind: 0.55, mp: 0.90, mil: 3, eco: 2, sta: 2, nav: 1, fleets: 0, ships: 2, navBonus: 0.0,
                    traits: ["CavalryTradition", "HomelandDefense", "FightToTheEnd"], lifetime: true, term: 40, warSupport: 72)
        ),
    ]

    // MARK: - 剧本 2：三国鼎立 · 赤壁鏖兵（公元 208 年，9 国）

    private static let sanguo208: [HistoricalNationRoster] = [
        // 0 曹魏
        n(0,
          founder: p("曹操", "曹", "操", "丞相·魏王", 53, 95, 96, 90, 94, ["Genius", "Strategist", "Administrator", "Conqueror", "Unifier"], "Ruler", "大汉丞相·魏武帝"),
          successors: [
              p("曹丕", "曹", "丕", "魏文帝", 21, 78, 88, 86, 86, ["Administrator", "Scholar", "Ambitious", "Lawgiver"], "Successor", "长子·五官中郎将"),
              p("曹叡", "曹", "叡", "魏明帝", 22, 82, 88, 82, 84, ["Strategist", "IronFist", "Diligent"], "Successor", "嫡孙·魏明帝"),
              p("司马懿", "司马", "懿", "太傅", 29, 90, 94, 88, 86, ["Genius", "Patient", "Strategist", "Tactician"], "Successor", "河内司马氏宗主"),
          ],
          notables: [
              p("荀彧", "荀", "彧", "尚书令", 45, 68, 97, 92, 92, ["Genius", "Administrator", "Just", "Visionary"], "Chancellor", "王佐之才"),
              p("郭嘉", "郭", "嘉", "军师祭酒", 38, 86, 84, 90, 88, ["Genius", "Strategist", "Visionary"], "Diplomat", "奇佐谋主"),
              p("司马懿", "司马", "懿", "文学掾·军师", 29, 90, 94, 88, 86, ["Genius", "Patient", "Strategist", "Tactician"], "Treasurer", "冢虎谋臣"),
              p("张辽", "张", "辽", "前将军", 39, 93, 72, 68, 88, ["Brave", "BattleHardened", "Tactician"], "WarCommander", "五子良将之首"),
              p("夏侯惇", "夏侯", "惇", "伏波将军", 50, 86, 78, 70, 86, ["Brave", "BattleHardened", "Diligent"], "WarCommander", "宗亲大将"),
              p("曹仁", "曹", "仁", "征南将军", 40, 89, 74, 68, 84, ["BattleHardened", "Patient", "Veteran"], "WarCommander", "宗室第一守将"),
              p("张郃", "张", "郃", "征西车骑将军", 41, 88, 70, 66, 80, ["Tactician", "Veteran", "BattleHardened"], "WarCommander", "巧变善阵名将"),
              p("徐晃", "徐", "晃", "右将军", 39, 87, 72, 66, 80, ["Just", "BattleHardened", "Veteran"], "WarCommander", "周亚夫之风"),
          ],
          families: [
              f("曹", "沛国曹氏", 92, 80, ruling: true),
              f("夏侯", "沛国夏侯氏", 80, 78),
              f("荀", "颍川荀氏", 76, 68),
              f("司马", "河内司马氏", 66, 52),
              f("陈", "颍川陈氏", 64, 66),
          ],
          parties: [pt("唯才是举派", 46), pt("颍川士族派", 30), pt("谯沛将门派", 24)],
          power: pw(ind: 2.35, mp: 1.95, mil: 5, eco: 5, sta: 5, nav: 2, fleets: 2, ships: 5, navBonus: 0.08,
                    traits: ["WellTrained", "FieldCombatElite", "Conqueror", "StrengthenCore"], lifetime: true, term: 40, warSupport: 84)
        ),
        // 1 孙吴
        n(1,
          founder: p("孙权", "孙", "权", "吴侯·车骑将军", 26, 78, 88, 91, 89, ["Diplomatic", "Patient", "NaturalLeader", "SeaVision"], "Ruler", "江东之主"),
          successors: [
              p("孙亮", "孙", "亮", "吴废帝", 18, 58, 68, 68, 68, ["Patient", "Scholar"], "Successor", "少子"),
              p("孙休", "孙", "休", "吴景帝", 24, 64, 78, 76, 76, ["Scholar", "Benevolent", "Just"], "Successor", "六子·景帝"),
              p("孙皓", "孙", "皓", "乌程侯", 26, 68, 60, 62, 64, ["Hawkish", "Tyrant", "Stubborn"], "Successor", "吴末帝"),
          ],
          notables: [
              p("周瑜", "周", "瑜", "大都督", 33, 94, 86, 88, 95, ["Genius", "NavalMastery", "ShipMaster", "Strategist", "Charismatic"], "Admiral", "江东水师大都督"),
              p("鲁肃", "鲁", "肃", "赞军校尉", 36, 78, 86, 93, 88, ["MasterDiplomat", "Visionary", "Benevolent"], "Diplomat", "榻上策盟主"),
              p("吕蒙", "吕", "蒙", "横野中郎将", 30, 90, 82, 76, 84, ["Tactician", "Diligent", "NavalMastery"], "Admiral", "白衣渡江名将"),
              p("陆逊", "陆", "逊", "海昌屯田都尉", 25, 93, 89, 86, 88, ["Genius", "Strategist", "Patient", "Administrator"], "WarCommander", "江东社稷之臣"),
              p("甘宁", "甘", "宁", "折冲将军", 33, 90, 58, 62, 84, ["Brave", "NavalMastery", "BattleHardened"], "Admiral", "锦帆水师悍将"),
              p("程普", "程", "普", "荡寇将军", 55, 84, 72, 70, 82, ["Veteran", "BattleHardened", "ShipMaster"], "WarCommander", "三世老将"),
              p("张昭", "张", "昭", "长史", 52, 54, 91, 84, 82, ["Administrator", "Lawgiver", "Just", "Scholar"], "Chancellor", "内事不决问张昭"),
          ],
          families: [
              f("孙", "吴郡孙氏", 88, 80, ruling: true),
              f("陆", "吴郡陆氏", 76, 66),
              f("顾", "吴郡顾氏", 70, 68),
              f("朱", "吴郡朱氏", 66, 68),
              f("张", "吴郡张氏", 68, 70),
          ],
          parties: [pt("江东世族派", 42), pt("淮泗功臣派", 34), pt("孙氏宗亲派", 24)],
          power: pw(ind: 1.75, mp: 1.35, mil: 4, eco: 5, sta: 4, nav: 5, fleets: 3, ships: 6, navBonus: 0.34,
                    traits: ["HomelandDefense", "CoreDefense", "WellTrained"], lifetime: true, term: 40, warSupport: 78)
        ),
        // 2 刘备
        n(2,
          founder: p("刘备", "刘", "备", "左将军·汉中王", 47, 82, 84, 92, 97, ["Charismatic", "Benevolent", "Beloved", "NaturalLeader", "Unifier"], "Ruler", "昭烈皇帝"),
          successors: [
              p("刘禅", "刘", "禅", "后主", 18, 48, 68, 74, 72, ["Patient", "Benevolent", "Dovish"], "Successor", "长子·安乐公"),
              p("姜维", "姜", "维", "大将军", 24, 90, 78, 74, 84, ["Brave", "Tactician", "Stubborn", "BattleHardened"], "Successor", "九伐中原继承者"),
          ],
          notables: [
              p("诸葛亮", "诸葛", "亮", "军师中郎将·丞相", 27, 91, 99, 98, 95, ["Genius", "Administrator", "MasterDiplomat", "Strategist", "Diligent"], "Chancellor", "卧龙先生·武乡侯"),
              p("关羽", "关", "羽", "前将军", 48, 97, 74, 68, 94, ["Brave", "BattleHardened", "Just", "NaturalLeader"], "WarCommander", "武圣·威震华夏"),
              p("张飞", "张", "飞", "征虏将军", 42, 96, 60, 56, 86, ["Brave", "BattleHardened", "Hawkish"], "WarCommander", "万人敌猛将"),
              p("赵云", "赵", "云", "牙门将军", 40, 94, 76, 74, 90, ["Brave", "Just", "Patient", "BattleHardened"], "WarCommander", "常胜将军"),
              p("庞统", "庞", "统", "军师中郎将", 29, 86, 88, 90, 84, ["Genius", "Strategist", "Visionary"], "Diplomat", "凤雏先生"),
              p("法正", "法", "正", "尚书令", 32, 86, 84, 82, 78, ["Tactician", "Strategist", "Ambitious"], "Treasurer", "翼侯奇谋"),
              p("黄忠", "黄", "忠", "征西将军", 58, 92, 62, 60, 82, ["Brave", "Veteran", "BattleHardened"], "WarCommander", "老当益壮"),
              p("魏延", "魏", "延", "镇远将军", 33, 90, 68, 58, 78, ["Brave", "Hawkish", "Tactician"], "WarCommander", "汉中镇守悍将"),
          ],
          families: [
              f("刘", "涿郡刘氏", 88, 80, ruling: true),
              f("诸葛", "琅琊诸葛氏", 76, 82),
              f("关", "河东关氏", 72, 80),
              f("马", "荆州马氏", 62, 72),
          ],
          parties: [pt("兴复汉室派", 48), pt("荆楚元勋派", 32), pt("东州益州派", 20)],
          power: pw(ind: 1.45, mp: 1.25, mil: 5, eco: 4, sta: 5, nav: 3, fleets: 1, ships: 5, navBonus: 0.14,
                    traits: ["FightToTheEnd", "FieldCombatElite", "HomelandDefense"], lifetime: true, term: 40, warSupport: 88)
        ),
        // 3 益州刘璋
        n(3,
          founder: p("刘璋", "刘", "璋", "益州牧", 46, 56, 72, 72, 74, ["Benevolent", "Dovish", "Patient"], "Ruler", "益州牧"),
          successors: [
              p("刘循", "刘", "循", "奉车中郎将", 24, 68, 72, 70, 72, ["Patient", "Just"], "Successor", "长子"),
          ],
          notables: [
              p("张任", "张", "任", "益州从事·大将", 40, 88, 72, 68, 84, ["Brave", "Just", "Tactician"], "WarCommander", "蜀中忠烈名将"),
              p("严颜", "严", "颜", "巴郡太守", 56, 84, 74, 70, 84, ["Veteran", "Brave", "Just"], "WarCommander", "断头将军"),
              p("黄权", "黄", "权", "主簿", 40, 78, 86, 84, 82, ["Administrator", "Visionary", "Patient"], "Chancellor", "蜀中良谋"),
              p("王累", "王", "累", "从事", 44, 54, 78, 76, 74, ["Just", "Stubborn"], "Diplomat", "倒悬谏主忠臣"),
          ],
          families: [
              f("刘", "江夏刘氏", 80, 80, ruling: true),
              f("黄", "巴西黄氏", 64, 64),
              f("张", "蜀郡张氏", 62, 62),
          ],
          parties: [pt("益州本土派", 58), pt("东州客籍派", 42)],
          power: pw(ind: 1.40, mp: 1.15, mil: 3, eco: 4, sta: 3, nav: 1, fleets: 0, ships: 2, navBonus: 0.0,
                    traits: ["CoreDefense", "HomelandDefense"], lifetime: true, term: 40, warSupport: 54)
        ),
        // 4 西凉马腾
        n(4,
          founder: p("马腾", "马", "腾", "征西将军", 52, 86, 68, 66, 84, ["Brave", "BattleHardened", "NaturalLeader"], "Ruler", "西凉雄帅"),
          successors: [
              p("马超", "马", "超", "锦马超", 32, 95, 64, 62, 88, ["Brave", "BattleHardened", "Conqueror", "Hawkish"], "Successor", "长子·神威天将军"),
              p("马岱", "马", "岱", "平北将军", 28, 84, 68, 66, 78, ["Brave", "Veteran", "Diligent"], "Successor", "从弟"),
          ],
          notables: [
              p("庞德", "庞", "德", "立义将军", 38, 91, 66, 60, 82, ["Brave", "BattleHardened", "Stubborn"], "WarCommander", "白马将军"),
              p("韩遂", "韩", "遂", "镇西将军", 58, 84, 76, 78, 82, ["Ambitious", "Tactician", "Veteran"], "Chancellor", "凉州盟主"),
          ],
          families: [
              f("马", "扶风马氏", 84, 80, ruling: true),
              f("韩", "金城韩氏", 68, 52),
              f("庞", "南安庞氏", 60, 74),
          ],
          parties: [pt("凉州铁骑派", 66), pt("宗室勋贵派", 34)],
          power: pw(ind: 0.90, mp: 1.10, mil: 4, eco: 3, sta: 3, nav: 1, fleets: 0, ships: 2, navBonus: 0.0,
                    traits: ["CavalryTradition", "FieldCombatElite"], lifetime: true, term: 40, warSupport: 78)
        ),
        // 5 汉中张鲁
        n(5,
          founder: p("张鲁", "张", "鲁", "镇民中郎将·师君", 46, 70, 84, 78, 86, ["Benevolent", "Administrator", "Patient"], "Ruler", "五斗米道师君"),
          successors: [
              p("张卫", "张", "卫", "昭义将军", 40, 78, 70, 66, 76, ["Brave", "Stubborn"], "Successor", "胞弟·阳平关守将"),
          ],
          notables: [
              p("阎圃", "阎", "圃", "功曹", 42, 66, 86, 84, 80, ["Administrator", "Diplomatic", "Patient"], "Chancellor", "汉中智囊"),
              p("杨任", "杨", "任", "汉中牙将", 38, 78, 64, 60, 72, ["Brave", "BattleHardened"], "WarCommander", "汉中守将"),
          ],
          families: [
              f("张", "沛国天师张氏", 86, 80, ruling: true),
              f("阎", "巴西安汉阎氏", 62, 74),
          ],
          parties: [pt("五斗米道派", 68), pt("益州本土派", 32)],
          power: pw(ind: 0.95, mp: 0.85, mil: 3, eco: 4, sta: 4, nav: 1, fleets: 0, ships: 2, navBonus: 0.0,
                    traits: ["CoreDefense", "HomelandDefense"], lifetime: true, term: 40, warSupport: 70)
        ),
        // 6 辽东公孙
        n(6,
          founder: p("公孙康", "公孙", "康", "辽东太守", 38, 78, 76, 74, 76, ["Patient", "Ambitious", "Administrator"], "Ruler", "辽东之主"),
          successors: [
              p("公孙渊", "公孙", "渊", "燕王", 26, 76, 70, 72, 74, ["Ambitious", "Hawkish", "Stubborn"], "Successor", "次子·自立燕王"),
          ],
          notables: [
              p("卑衍", "卑", "衍", "辽东大将军", 38, 78, 64, 60, 72, ["Brave", "BattleHardened"], "WarCommander", "辽东主力统帅"),
              p("柳毅", "柳", "毅", "长史", 42, 62, 78, 76, 74, ["Administrator", "Diligent"], "Chancellor", "辽东幕僚"),
          ],
          families: [
              f("公孙", "襄平公孙氏", 84, 80, ruling: true),
              f("柳", "辽东柳氏", 58, 66),
          ],
          parties: [pt("辽东世守派", 64), pt("宗室勋贵派", 36)],
          power: pw(ind: 0.90, mp: 0.85, mil: 3, eco: 3, sta: 3, nav: 2, fleets: 1, ships: 3, navBonus: 0.06,
                    traits: ["HomelandDefense", "CoreDefense"], lifetime: true, term: 40, warSupport: 64)
        ),
        // 7 鲜卑
        n(7,
          founder: p("步度根", "鲜卑", "步度根", "大人", 38, 82, 64, 68, 78, ["Brave", "BattleHardened"], "Ruler", "檀石槐之孙"),
          successors: [
              p("轲比能", "鲜卑", "轲比能", "鲜卑大单于", 32, 90, 82, 78, 90, ["Unifier", "Just", "Tactician", "NaturalLeader"], "Successor", "草原统一雄主"),
          ],
          notables: [
              p("扶罗韩", "鲜卑", "扶罗韩", "鲜卑别部大人", 36, 80, 62, 60, 74, ["Brave", "Hawkish"], "WarCommander", "步度根之兄"),
              p("素利", "鲜卑", "素利", "东部大人", 40, 78, 66, 66, 74, ["Diplomatic", "Veteran"], "WarCommander", "东鲜卑首领"),
          ],
          families: [
              f("鲜卑", "檀石槐王庭", 80, 80, ruling: true),
              f("慕容", "慕容部", 60, 58),
              f("拓跋", "拓跋部", 60, 58),
          ],
          parties: [pt("鲜卑诸部派", 66), pt("草原牧主派", 34)],
          power: pw(ind: 0.60, mp: 1.15, mil: 4, eco: 2, sta: 2, nav: 1, fleets: 0, ships: 2, navBonus: 0.0,
                    traits: ["CavalryTradition", "Conqueror"], lifetime: true, term: 40, warSupport: 76)
        ),
        // 8 交州士燮
        n(8,
          founder: p("士燮", "士", "燮", "交趾太守·威彦公", 58, 68, 90, 88, 90, ["Administrator", "Benevolent", "Scholar", "Beloved"], "Ruler", "南交学祖·宽厚治岭"),
          successors: [
              p("士徽", "士", "徽", "交趾太守", 34, 72, 66, 64, 70, ["Stubborn", "Ambitious"], "Successor", "三子"),
          ],
          notables: [
              p("士壹", "士", "壹", "合浦太守", 52, 72, 82, 80, 80, ["Administrator", "Patient"], "Chancellor", "胞弟·合浦守臣"),
              p("桓邻", "桓", "邻", "府吏", 42, 66, 78, 80, 76, ["Just", "Diplomatic"], "Diplomat", "交州名士"),
          ],
          families: [
              f("士", "苍梧士氏", 88, 80, ruling: true),
              f("桓", "交趾桓氏", 58, 70),
          ],
          parties: [pt("交州儒商派", 64), pt("部族长老派", 36)],
          power: pw(ind: 0.95, mp: 0.80, mil: 2, eco: 4, sta: 4, nav: 3, fleets: 1, ships: 4, navBonus: 0.12,
                    traits: ["CoreDefense", "StrengthenCore"], lifetime: true, term: 40, warSupport: 54)
        ),
    ]

    // MARK: - 剧本 3：盛唐风云 · 安史之乱（公元 755 年，7 国）

    private static let tang755: [HistoricalNationRoster] = [
        // 0 大唐
        n(0,
          founder: p("李隆基", "李", "隆基", "唐玄宗", 58, 76, 84, 86, 90, ["Charismatic", "Visionary", "Extravagant", "Veteran"], "Ruler", "开元盛世之主"),
          successors: [
              p("李亨", "李", "亨", "唐肃宗", 44, 78, 82, 80, 82, ["Patient", "BattleHardened", "Reformer"], "Successor", "灵武即位·中兴之主"),
              p("李豫", "李", "豫", "唐代宗", 29, 80, 82, 82, 82, ["Benevolent", "Diplomatic", "Patient"], "Successor", "天下兵马元帅"),
              p("李适", "李", "适", "唐德宗", 24, 72, 80, 76, 76, ["Reformer", "Stubborn", "Administrator"], "Successor", "两税法推行者"),
          ],
          notables: [
              p("郭子仪", "郭", "子仪", "朔方节度使·汾阳王", 58, 95, 86, 88, 94, ["Genius", "BattleHardened", "Patient", "Beloved", "NaturalLeader"], "WarCommander", "再造大唐元勋"),
              p("李光弼", "李", "光弼", "河东节度使", 47, 93, 78, 70, 84, ["Strategist", "Tactician", "IronFist", "BattleHardened"], "WarCommander", "中兴战功第一"),
              p("哥舒翰", "哥舒", "翰", "河西陇右节度使", 56, 89, 70, 66, 84, ["Brave", "BattleHardened", "Veteran"], "WarCommander", "潼关大帅"),
              p("高仙芝", "高", "仙芝", "安西副都护", 52, 90, 72, 70, 82, ["Brave", "Tactician", "Conqueror"], "WarCommander", "西域名将"),
              p("封常清", "封", "常清", "范阳平卢节度使", 50, 84, 78, 72, 78, ["Diligent", "Tactician", "Just"], "WarCommander", "高仙芝搭档"),
              p("颜真卿", "颜", "真卿", "平原太守", 46, 76, 88, 84, 92, ["Just", "Scholar", "Brave", "Beloved"], "Diplomat", "义军领袖·书圣"),
              p("张巡", "张", "巡", "真源令·睢阳守将", 46, 90, 78, 70, 90, ["Brave", "Stubborn", "Tactician"], "WarCommander", "铁血守睢阳"),
              p("杨国忠", "杨", "国忠", "右相", 50, 52, 74, 68, 64, ["Financier", "Greedy", "Ambitious"], "Chancellor", "贵妃从兄·右相"),
          ],
          families: [
              f("李", "陇西李氏", 94, 80, ruling: true),
              f("杨", "弘农杨氏", 76, 68),
              f("卢", "范阳卢氏", 68, 60),
              f("崔", "清河崔氏", 66, 62),
              f("郑", "荥阳郑氏", 64, 64),
          ],
          parties: [pt("关陇将门派", 42), pt("山东士族派", 32), pt("科举新进派", 26)],
          power: pw(ind: 2.85, mp: 2.15, mil: 5, eco: 5, sta: 5, nav: 3, fleets: 2, ships: 5, navBonus: 0.14,
                    traits: ["StrengthenCore", "WellTrained", "HomelandDefense", "ManifestDestiny"], lifetime: true, term: 40, warSupport: 74)
        ),
        // 1 吐蕃
        n(1,
          founder: p("赤松德赞", "雅隆", "赤松德赞", "赞普", 22, 88, 88, 84, 92, ["Ambitious", "Conqueror", "Visionary", "NaturalLeader"], "Ruler", "吐蕃鼎盛赞普"),
          successors: [
              p("牟尼赞普", "雅隆", "牟尼", "赞普", 22, 72, 80, 76, 80, ["Benevolent", "Reformer", "Just"], "Successor", "长子"),
              p("赤祖德赞", "雅隆", "赤祖德赞", "赞普", 24, 78, 84, 86, 84, ["Diplomatic", "Patient", "Scholar"], "Successor", "长庆会盟之主"),
          ],
          notables: [
              p("尚结赞", "没庐", "尚结赞", "大相", 42, 88, 86, 90, 84, ["Strategist", "MasterDiplomat", "Tactician"], "Chancellor", "吐蕃一代名相"),
              p("马重英", "恩兰", "马重英", "大论·统帅", 38, 90, 72, 66, 84, ["Brave", "BattleHardened", "Conqueror"], "WarCommander", "入长安名将"),
              p("论恐热", "末", "论恐热", "洛门川讨击使", 34, 84, 66, 60, 78, ["Hawkish", "Ambitious", "BattleHardened"], "WarCommander", "吐蕃悍将"),
          ],
          families: [
              f("雅隆", "雅隆赞普王室", 90, 80, ruling: true),
              f("没庐", "没庐氏外戚", 72, 68),
              f("恩兰", "恩兰氏大相府", 68, 70),
          ],
          parties: [pt("吐蕃赞普派", 48), pt("大相世卿派", 30), pt("寺院护法派", 22)],
          power: pw(ind: 1.55, mp: 1.45, mil: 5, eco: 3, sta: 4, nav: 1, fleets: 0, ships: 2, navBonus: 0.0,
                    traits: ["CavalryTradition", "Conqueror", "FightToTheEnd"], lifetime: true, term: 40, warSupport: 84)
        ),
        // 2 回纥
        n(2,
          founder: p("磨延啜", "药罗葛", "磨延啜", "葛勒可汗", 42, 90, 78, 80, 88, ["Brave", "BattleHardened", "Conqueror", "NaturalLeader"], "Ruler", "回纥英武可汗"),
          successors: [
              p("移地健", "药罗葛", "移地健", "牟羽可汗", 28, 84, 76, 78, 82, ["Ambitious", "Hawkish", "Diplomatic"], "Successor", "助唐平叛可汗"),
              p("顿莫贺达干", "药罗葛", "顿莫贺", "武义成功可汗", 36, 82, 82, 80, 84, ["Administrator", "Just", "Patient"], "Successor", "中兴贤汗"),
          ],
          notables: [
              p("叶护太子", "药罗葛", "叶护", "叶护大帅", 26, 88, 72, 74, 84, ["Brave", "BattleHardened"], "WarCommander", "助唐收复两京"),
              p("药罗葛骨啜", "药罗葛", "骨啜", "宰相", 44, 76, 80, 82, 78, ["Diplomatic", "Administrator"], "Chancellor", "回纥重臣"),
          ],
          families: [
              f("药罗葛", "药罗葛可汗氏", 88, 80, ruling: true),
              f("仆固", "仆固贵部", 66, 68),
          ],
          parties: [pt("回纥汗庭派", 64), pt("草原牧主派", 36)],
          power: pw(ind: 1.05, mp: 1.25, mil: 5, eco: 3, sta: 3, nav: 1, fleets: 0, ships: 2, navBonus: 0.0,
                    traits: ["CavalryTradition", "FieldCombatElite"], lifetime: true, term: 40, warSupport: 80)
        ),
        // 3 南诏
        n(3,
          founder: p("阁罗凤", "蒙", "阁罗凤", "南诏王", 43, 86, 84, 82, 86, ["Brave", "Administrator", "Strategist"], "Ruler", "南诏神武王"),
          successors: [
              p("异牟寻", "蒙", "异牟寻", "南诏王", 24, 84, 88, 88, 86, ["Diplomatic", "Visionary", "Reformer"], "Successor", "归唐兴文之主"),
          ],
          notables: [
              p("凤伽异", "蒙", "凤伽异", "世子大将", 26, 82, 76, 74, 80, ["Brave", "Tactician"], "WarCommander", "阁罗凤之子"),
              p("郑回", "郑", "回", "清平官", 44, 62, 88, 86, 82, ["Scholar", "Administrator", "Diplomatic"], "Chancellor", "汉人清平官"),
          ],
          families: [
              f("蒙", "蒙氏王族", 86, 80, ruling: true),
              f("郑", "郑氏清平官", 64, 72),
              f("段", "段氏将门", 62, 70),
          ],
          parties: [pt("南诏王族派", 62), pt("部族长老派", 38)],
          power: pw(ind: 1.15, mp: 1.05, mil: 4, eco: 3, sta: 4, nav: 1, fleets: 0, ships: 2, navBonus: 0.0,
                    traits: ["HomelandDefense", "CoreDefense"], lifetime: true, term: 40, warSupport: 72)
        ),
        // 4 渤海国
        n(4,
          founder: p("大钦茂", "大", "钦茂", "渤海文王", 42, 76, 90, 88, 86, ["Administrator", "Scholar", "Diplomatic", "Reformer"], "Ruler", "海东盛国文王"),
          successors: [
              p("大华玙", "大", "华玙", "渤海成王", 26, 70, 78, 76, 76, ["Patient", "Administrator"], "Successor", "嫡孙"),
              p("大嵩璘", "大", "嵩璘", "渤海康王", 32, 74, 82, 80, 80, ["Diligent", "Diplomatic"], "Successor", "康王"),
          ],
          notables: [
              p("大宏临", "大", "宏临", "王世子", 24, 76, 78, 76, 78, ["Brave", "Diligent"], "WarCommander", "渤海世子"),
              p("杨承庆", "杨", "承庆", "遣唐使·大相", 40, 64, 84, 88, 80, ["MasterDiplomat", "Scholar"], "Diplomat", "渤海名使"),
          ],
          families: [
              f("大", "大氏王族", 88, 80, ruling: true),
              f("高", "高氏世卿", 64, 70),
          ],
          parties: [pt("渤海勋贵派", 62), pt("科举新进派", 38)],
          power: pw(ind: 1.25, mp: 1.00, mil: 3, eco: 4, sta: 4, nav: 2, fleets: 1, ships: 4, navBonus: 0.08,
                    traits: ["StrengthenCore", "CoreDefense"], lifetime: true, term: 40, warSupport: 60)
        ),
        // 5 新罗
        n(5,
          founder: p("金宪英", "金", "宪英", "景德王", 38, 70, 86, 84, 84, ["Reformer", "Administrator", "Scholar"], "Ruler", "统一新罗盛主"),
          successors: [
              p("金乾运", "金", "乾运", "惠恭王", 20, 62, 70, 72, 70, ["Patient", "Benevolent"], "Successor", "嫡子"),
          ],
          notables: [
              p("金邕", "金", "邕", "上大等", 44, 76, 84, 78, 80, ["Administrator", "Just"], "Chancellor", "真骨重臣"),
              p("金良相", "金", "良相", "侍中", 40, 78, 82, 76, 80, ["Ambitious", "Veteran"], "WarCommander", "后为宣德王"),
          ],
          families: [
              f("金", "庆州金氏", 90, 80, ruling: true),
              f("朴", "朴氏真骨", 66, 64),
          ],
          parties: [pt("骨品贵族派", 60), pt("科举新进派", 40)],
          power: pw(ind: 1.25, mp: 0.95, mil: 3, eco: 4, sta: 4, nav: 3, fleets: 2, ships: 4, navBonus: 0.14,
                    traits: ["CoreDefense", "WellTrained"], lifetime: true, term: 40, warSupport: 60)
        ),
        // 6 黑衣大食
        n(6,
          founder: p("阿布·贾法尔·曼苏尔", "阿拔斯", "曼苏尔", "哈里发", 41, 84, 94, 88, 90, ["Administrator", "IronFist", "Visionary", "Lawgiver"], "Ruler", "巴格达奠基者"),
          successors: [
              p("马赫迪", "阿拔斯", "马赫迪", "哈里发", 24, 78, 86, 86, 88, ["Benevolent", "Charismatic", "Financier"], "Successor", "第三代哈里发"),
              p("哈伦·拉希德", "阿拔斯", "哈伦", "哈里发", 22, 84, 92, 92, 95, ["Genius", "Scholar", "MasterDiplomat", "Visionary"], "Successor", "黄金时代大哈里发"),
          ],
          notables: [
              p("齐雅德·伊本·萨利赫", "萨利赫", "齐雅德", "呼罗珊大将", 40, 89, 74, 72, 82, ["BattleHardened", "Tactician", "Conqueror"], "WarCommander", "怛罗斯之战主帅"),
              p("哈立德·巴尔马克", "巴尔马克", "哈立德", "大维齐尔", 46, 66, 92, 88, 84, ["Administrator", "Financier", "Scholar"], "Chancellor", "巴尔马克相门奠基人"),
          ],
          families: [
              f("阿拔斯", "阿拔斯哈里发家族", 92, 80, ruling: true),
              f("巴尔马克", "巴尔马克相门", 74, 72),
          ],
          parties: [pt("阿拔斯哈里发派", 58), pt("呼罗珊军团派", 42)],
          power: pw(ind: 2.30, mp: 1.80, mil: 5, eco: 5, sta: 5, nav: 3, fleets: 2, ships: 5, navBonus: 0.14,
                    traits: ["Conqueror", "CavalryTradition", "ManifestDestiny"], lifetime: true, term: 40, warSupport: 78)
        ),
    ]

    // MARK: - 剧本 4：宋金对峙 · 绍兴和议（公元 1142 年，8 国）

    private static let songJin1142: [HistoricalNationRoster] = [
        // 0 金朝
        n(0,
          founder: p("完颜亶", "完颜", "亶", "金熙宗", 24, 76, 82, 78, 80, ["Reformer", "Scholar", "Stubborn"], "Ruler", "金熙宗"),
          successors: [
              p("完颜亮", "完颜", "亮", "海陵王", 28, 84, 82, 74, 80, ["Ambitious", "Hawkish", "IronFist", "Conqueror"], "Successor", "迁都燕京·南征雄主"),
              p("完颜雍", "完颜", "雍", "金世宗", 34, 84, 94, 88, 92, ["Administrator", "Benevolent", "Just", "Beloved"], "Successor", "小尧舜·大定盛世"),
          ],
          notables: [
              p("完颜宗弼", "完颜", "宗弼", "都元帅·梁王", 44, 92, 84, 78, 90, ["BattleHardened", "Strategist", "Brave", "NaturalLeader"], "WarCommander", "金兀术·四太子"),
              p("完颜宗翰", "完颜", "宗翰", "粘罕·太保", 52, 91, 84, 76, 86, ["Strategist", "IronFist", "Veteran"], "Chancellor", "金国开国元勋"),
              p("完颜昌", "完颜", "昌", "鲁国王", 48, 80, 78, 82, 76, ["Diplomatic", "Veteran"], "Diplomat", "主和宗室重臣"),
              p("徒单克宁", "徒单", "克宁", "尚书左丞相", 38, 84, 86, 80, 84, ["Just", "Administrator", "Veteran"], "Treasurer", "金世宗股肱"),
          ],
          families: [
              f("完颜", "完颜皇室", 94, 80, ruling: true),
              f("徒单", "徒单外戚", 72, 70),
              f("仆散", "仆散将门", 66, 68),
              f("纥石烈", "纥石烈将门", 64, 66),
          ],
          parties: [pt("女真猛安派", 46), pt("完颜宗室派", 30), pt("汉化文治派", 24)],
          power: pw(ind: 2.05, mp: 1.65, mil: 5, eco: 4, sta: 4, nav: 2, fleets: 1, ships: 4, navBonus: 0.06,
                    traits: ["CavalryTradition", "FieldCombatElite", "Conqueror"], lifetime: true, term: 40, warSupport: 78)
        ),
        // 1 南宋
        n(1,
          founder: p("赵构", "赵", "构", "宋高宗", 35, 64, 78, 82, 78, ["Patient", "Dovish", "Diplomatic", "Paranoid"], "Ruler", "南宋开国皇帝"),
          successors: [
              p("赵昚", "赵", "昚", "宋孝宗", 25, 82, 90, 86, 90, ["Diligent", "Reformer", "Just", "Visionary"], "Successor", "乾淳之治·南宋第一明君"),
              p("赵惇", "赵", "惇", "宋光宗", 30, 64, 72, 70, 68, ["Stubborn", "Paranoid"], "Successor", "孝宗之子"),
          ],
          notables: [
              p("韩世忠", "韩", "世忠", "枢密使·蕲王", 53, 94, 76, 74, 92, ["Brave", "BattleHardened", "NavalMastery", "Just"], "WarCommander", "中兴四将·黄天荡名将"),
              p("吴璘", "吴", "璘", "川陕宣抚副使", 40, 90, 80, 74, 86, ["Tactician", "Patient", "BattleHardened"], "WarCommander", "守蜀名将"),
              p("刘锜", "刘", "锜", "荆南军节度使", 44, 91, 78, 72, 86, ["Strategist", "BattleHardened", "Tactician"], "WarCommander", "顺昌大捷主帅"),
              p("虞允文", "虞", "允文", "中书舍人·水师督军", 32, 88, 90, 84, 88, ["Genius", "NavalMastery", "Administrator", "Tactician"], "Admiral", "采石矶大捷统帅"),
              p("李宝", "李", "宝", "两浙西路马步军副总管", 36, 87, 70, 66, 82, ["NavalMastery", "ShipMaster", "Brave"], "Admiral", "唐岛海战火器水师名将"),
              p("秦桧", "秦", "桧", "尚书左仆射·太师", 52, 46, 82, 80, 68, ["Administrator", "Diplomatic", "Dovish"], "Chancellor", "绍兴宰执"),
              p("辛弃疾", "辛", "弃疾", "稼轩居士·抗金豪杰", 24, 88, 84, 78, 90, ["Brave", "Scholar", "Hawkish", "Charismatic"], "Diplomat", "飞虎军统帅"),
          ],
          families: [
              f("赵", "天水赵氏", 90, 80, ruling: true),
              f("丁", "济阳丁氏", 66, 68),
              f("钱", "吴越钱氏", 68, 72),
          ],
          parties: [pt("主战北伐派", 42), pt("主和议款派", 36), pt("理学清议派", 22)],
          power: pw(ind: 2.65, mp: 1.80, mil: 4, eco: 6, sta: 5, nav: 5, fleets: 3, ships: 7, navBonus: 0.34,
                    traits: ["CoreDefense", "HomelandDefense", "StrengthenCore"], lifetime: true, term: 40, warSupport: 68)
        ),
        // 2 西夏
        n(2,
          founder: p("李仁孝", "李", "仁孝", "夏仁宗", 24, 76, 90, 84, 86, ["Administrator", "Scholar", "Reformer", "Patient"], "Ruler", "西夏盛世明君"),
          successors: [
              p("李纯佑", "李", "纯佑", "夏桓宗", 22, 68, 78, 76, 76, ["Benevolent", "Dovish"], "Successor", "长子"),
          ],
          notables: [
              p("任得敬", "任", "得敬", "尚书令", 42, 80, 84, 78, 78, ["Ambitious", "Administrator", "Tactician"], "Chancellor", "西夏权相"),
              p("嵬名察哥", "嵬名", "察哥", "晋王·大将", 50, 86, 74, 70, 82, ["Veteran", "BattleHardened"], "WarCommander", "西夏宗室柱石"),
          ],
          families: [
              f("李", "拓跋李氏皇室", 86, 80, ruling: true),
              f("任", "任氏外戚", 66, 52),
              f("嵬名", "嵬名宗亲", 68, 72),
          ],
          parties: [pt("党项王室派", 60), pt("汉化文治派", 40)],
          power: pw(ind: 1.20, mp: 1.05, mil: 4, eco: 4, sta: 4, nav: 1, fleets: 0, ships: 2, navBonus: 0.0,
                    traits: ["CavalryTradition", "HomelandDefense"], lifetime: true, term: 40, warSupport: 70)
        ),
        // 3 大理
        n(3,
          founder: p("段正严", "段", "正严", "大理宪宗", 54, 72, 82, 82, 84, ["Benevolent", "Patient", "Diplomatic"], "Ruler", "段和誉·勤政仁君"),
          successors: [
              p("段正兴", "段", "正兴", "大理景宗", 28, 70, 78, 78, 78, ["Patient", "Administrator"], "Successor", "皇子"),
              p("段智兴", "段", "智兴", "大理宣宗", 26, 68, 74, 74, 76, ["Benevolent", "Scholar"], "Successor", "宣宗"),
          ],
          notables: [
              p("高泰明", "高", "泰明", "相国·中国公", 46, 80, 86, 80, 82, ["Administrator", "Just", "Veteran"], "Chancellor", "善阐高氏相国"),
              p("高量成", "高", "量成", "大将军", 38, 82, 74, 70, 78, ["Brave", "BattleHardened"], "WarCommander", "大理柱石将领"),
          ],
          families: [
              f("段", "大理段氏", 82, 80, ruling: true),
              f("高", "善阐高氏", 78, 66),
          ],
          parties: [pt("段氏高氏派", 64), pt("寺院护法派", 36)],
          power: pw(ind: 1.05, mp: 0.90, mil: 3, eco: 4, sta: 4, nav: 1, fleets: 0, ships: 2, navBonus: 0.0,
                    traits: ["CoreDefense", "HomelandDefense"], lifetime: true, term: 40, warSupport: 58)
        ),
        // 4 蒙古诸部
        n(4,
          founder: p("合不勒汗", "乞颜", "合不勒", "蒙兀大汗", 46, 88, 76, 74, 88, ["Brave", "NaturalLeader", "Unifier", "BattleHardened"], "Ruler", "蒙兀国首任大汗"),
          successors: [
              p("俺巴孩汗", "泰赤乌", "俺巴孩", "大汗", 40, 82, 74, 72, 82, ["Brave", "Just"], "Successor", "泰赤乌部大汗"),
              p("也速该", "乞颜", "也速该", "把阿秃儿", 30, 88, 74, 72, 86, ["Brave", "BattleHardened", "NaturalLeader"], "Successor", "成吉思汗之父"),
              p("铁木真", "孛儿只斤", "铁木真", "成吉思汗", 24, 99, 94, 88, 99, ["Genius", "Conqueror", "Unifier", "Strategist", "NaturalLeader"], "Successor", "一代天骄·蒙古帝国奠基人"),
          ],
          notables: [
              p("忽图剌", "乞颜", "忽图剌", "猛将", 34, 88, 66, 62, 82, ["Brave", "BattleHardened"], "WarCommander", "合不勒之子"),
              p("把儿坛", "乞颜", "把儿坛", "把阿秃儿", 32, 84, 70, 68, 80, ["Brave", "Tactician"], "WarCommander", "也速该之父"),
          ],
          families: [
              f("孛儿只斤", "乞颜孛儿只斤部", 86, 80, ruling: true),
              f("泰赤乌", "泰赤乌部", 68, 56),
              f("弘吉剌", "弘吉剌姻亲部", 62, 76),
          ],
          parties: [pt("诸部那颜派", 62), pt("汗庭卫队派", 38)],
          power: pw(ind: 0.78, mp: 1.35, mil: 5, eco: 2, sta: 3, nav: 1, fleets: 0, ships: 2, navBonus: 0.0,
                    traits: ["CavalryTradition", "Conqueror", "FieldCombatElite"], lifetime: true, term: 40, warSupport: 88)
        ),
        // 5 高丽
        n(5,
          founder: p("王楷", "王", "楷", "高丽仁宗", 33, 68, 82, 80, 78, ["Scholar", "Patient", "Administrator"], "Ruler", "高丽仁宗"),
          successors: [
              p("王晛", "王", "晛", "高丽毅宗", 22, 62, 68, 68, 68, ["Extravagant", "Stubborn"], "Successor", "长子"),
              p("王晧", "王", "晧", "高丽明宗", 26, 66, 74, 72, 72, ["Patient", "Benevolent"], "Successor", "三子"),
          ],
          notables: [
              p("金富轼", "金", "富轼", "门下侍中", 58, 76, 90, 86, 84, ["Scholar", "Administrator", "Just"], "Chancellor", "三国史记编纂者"),
              p("尹彦颐", "尹", "彦颐", "枢密院使", 48, 80, 80, 76, 78, ["Veteran", "BattleHardened"], "WarCommander", "名将尹瓘之子"),
          ],
          families: [
              f("王", "开城王氏皇室", 86, 80, ruling: true),
              f("金", "庆州金氏门阀", 72, 68),
              f("尹", "坡平尹氏", 62, 70),
          ],
          parties: [pt("门阀文臣派", 62), pt("士林清议派", 38)],
          power: pw(ind: 1.25, mp: 0.95, mil: 3, eco: 4, sta: 4, nav: 3, fleets: 1, ships: 5, navBonus: 0.14,
                    traits: ["CoreDefense", "HomelandDefense"], lifetime: true, term: 40, warSupport: 60)
        ),
        // 6 吐蕃诸部
        n(6,
          founder: p("萨迦贡噶宁波", "款", "贡噶宁波", "萨迦法王", 48, 68, 86, 84, 88, ["Scholar", "Just", "Benevolent", "Diplomatic"], "Ruler", "萨迦五祖之首"),
          successors: [
              p("索南孜摩", "款", "索南孜摩", "萨迦法王", 24, 66, 84, 82, 84, ["Scholar", "Patient"], "Successor", "次子"),
              p("扎巴坚赞", "款", "扎巴坚赞", "萨迦法王", 22, 68, 86, 84, 86, ["Administrator", "Scholar"], "Successor", "三子"),
          ],
          notables: [
              p("唃厮啰余帅", "唃厮啰", "余帅", "河湟大帅", 44, 80, 70, 68, 76, ["Veteran", "Brave"], "WarCommander", "河湟吐蕃首领"),
              p("帕木竹巴", "朗", "帕木竹巴", "噶举大师", 34, 64, 80, 80, 84, ["Scholar", "Charismatic"], "Diplomat", "藏东名僧"),
          ],
          families: [
              f("款", "萨迦款氏", 82, 80, ruling: true),
              f("朗", "帕竹朗氏", 62, 66),
          ],
          parties: [pt("萨迦教派", 64), pt("寺院护法派", 36)],
          power: pw(ind: 0.72, mp: 0.85, mil: 3, eco: 3, sta: 3, nav: 1, fleets: 0, ships: 2, navBonus: 0.0,
                    traits: ["HomelandDefense", "CoreDefense"], lifetime: true, term: 40, warSupport: 62)
        ),
        // 7 大越
        n(7,
          founder: p("李天祚", "李", "天祚", "李英宗", 20, 72, 80, 80, 80, ["Patient", "Administrator", "Benevolent"], "Ruler", "大越李英宗"),
          successors: [
              p("李龙𣉙", "李", "龙𣉙", "李高宗", 18, 64, 72, 72, 72, ["Patient", "Diplomatic"], "Successor", "皇子"),
          ],
          notables: [
              p("杜英武", "杜", "英武", "太尉·辅政", 36, 78, 82, 76, 76, ["Ambitious", "Administrator"], "Chancellor", "大越辅政太尉"),
              p("苏宪诚", "苏", "宪诚", "太尉", 38, 84, 88, 82, 86, ["Just", "Administrator", "Brave"], "WarCommander", "大越一代忠臣名将"),
          ],
          families: [
              f("李", "升龙李氏皇室", 86, 80, ruling: true),
              f("苏", "苏氏勋臣", 66, 76),
          ],
          parties: [pt("大越宗室派", 62), pt("儒臣保守派", 38)],
          power: pw(ind: 1.05, mp: 0.95, mil: 3, eco: 4, sta: 4, nav: 3, fleets: 1, ships: 4, navBonus: 0.14,
                    traits: ["HomelandDefense", "FightToTheEnd"], lifetime: true, term: 40, warSupport: 70)
        ),
    ]

    // MARK: - 剧本 5：日本战国 · 桶狭间合战（公元 1560 年，24 家大名 · O(1) 闭包构造防止 Swift 5.10 类型推断超时）

    private static let sengoku1560: [HistoricalNationRoster] = {
        var out = [HistoricalNationRoster]()
        out.reserveCapacity(24)
        // 0 织田
        out.append(n(0,
          founder: p("织田信长", "织田", "信长", "上总介·右大臣", 26, 96, 92, 88, 93, ["Genius", "Conqueror", "Reformer", "Visionary", "Unifier"], "Ruler", "第六天魔王·天下布武"),
          successors: [
              p("织田信忠", "织田", "信忠", "秋田城介", 18, 84, 82, 80, 82, ["Brave", "Diligent", "BattleHardened"], "Successor", "嫡长子"),
              p("羽柴秀吉", "羽柴", "秀吉", "关白·太阁", 23, 92, 96, 95, 96, ["Genius", "MasterDiplomat", "Administrator", "Unifier", "Charismatic"], "Successor", "丰臣秀吉·猴子"),
          ],
          notables: [
              p("柴田胜家", "柴田", "胜家", "笔头家老", 38, 91, 74, 62, 84, ["Brave", "BattleHardened", "Stubborn"], "WarCommander", "鬼柴田·冲锋悍将"),
              p("羽柴秀吉", "羽柴", "秀吉", "木下藤吉郎", 23, 92, 96, 95, 96, ["Genius", "MasterDiplomat", "Administrator", "Charismatic"], "Chancellor", "筑城与调略奇才"),
              p("丹羽长秀", "丹羽", "长秀", "五郎左卫门", 25, 80, 90, 84, 84, ["Administrator", "Diligent", "Financier"], "Treasurer", "米五郎左·内政柱石"),
              p("泷川一益", "泷川", "一益", "左近将监", 35, 86, 76, 78, 78, ["Tactician", "BattleHardened"], "WarCommander", "进退看泷川"),
              p("明智光秀", "明智", "光秀", "日向守", 32, 87, 88, 86, 82, ["Scholar", "Tactician", "Administrator"], "Diplomat", "智将十兵卫"),
              p("前田利家", "前田", "利家", "又左卫门", 22, 88, 80, 78, 86, ["Brave", "BattleHardened", "Charismatic"], "WarCommander", "枪之又左"),
          ],
          families: [
              f("织田", "织田本家", 90, 80, ruling: true),
              f("柴田", "柴田家", 72, 74),
              f("羽柴", "羽柴家", 70, 76),
              f("丹羽", "丹羽家", 68, 78),
          ],
          parties: [pt("尾张革新派", 56), pt("谱代家臣派", 44)],
          power: pw(ind: 1.95, mp: 1.35, mil: 5, eco: 5, sta: 5, nav: 3, fleets: 1, ships: 5, navBonus: 0.14,
                    traits: ["FieldCombatElite", "Conqueror", "WellTrained", "SiegeCapture"], lifetime: true, term: 40, warSupport: 86, startArmies: 4, maxArmies: 10)
        ))
        // 1 今川
        out.append(n(1,
          founder: p("今川义元", "今川", "义元", "治部大辅", 41, 82, 88, 86, 86, ["Administrator", "Lawgiver", "Diplomatic", "Financier"], "Ruler", "东海道第一弓取"),
          successors: [
              p("今川氏真", "今川", "氏真", "上总介", 22, 54, 68, 72, 68, ["Scholar", "Extravagant"], "Successor", "嫡子"),
          ],
          notables: [
              p("朝比奈泰朝", "朝比奈", "泰朝", "备中守", 32, 84, 76, 70, 80, ["Brave", "Just", "BattleHardened"], "WarCommander", "挂川城忠烈名将"),
              p("冈部元信", "冈部", "元信", "五郎兵卫", 36, 86, 72, 68, 82, ["Brave", "Veteran", "Stubborn"], "WarCommander", "鸣海城死战名将"),
              p("太原雪斋遗弟子", "今川", "氏丰", "评定众", 38, 70, 82, 80, 74, ["Scholar", "Administrator"], "Chancellor", "骏府文治重臣"),
          ],
          families: [
              f("今川", "骏河今川本家", 86, 80, ruling: true),
              f("朝比奈", "朝比奈家", 68, 76),
              f("冈部", "冈部家", 64, 74),
          ],
          parties: [pt("骏府公家旧仪派", 54), pt("今川谱代众", 46)],
          power: pw(ind: 1.55, mp: 1.35, mil: 4, eco: 4, sta: 4, nav: 2, fleets: 1, ships: 4, navBonus: 0.08,
                    traits: ["WellTrained", "StrengthenCore"], lifetime: true, term: 40, warSupport: 72, startArmies: 5, maxArmies: 10)
        ))
        // 2 武田
        out.append(n(2,
          founder: p("武田信玄", "武田", "信玄", "大膳大夫·甲斐之虎", 39, 97, 91, 88, 94, ["Genius", "Strategist", "Administrator", "BattleHardened", "Lawgiver"], "Ruler", "风林火山·甲斐之虎"),
          successors: [
              p("武田胜赖", "武田", "胜赖", "四郎", 18, 86, 70, 68, 80, ["Brave", "Hawkish", "BattleHardened"], "Successor", "四男·武田继主"),
          ],
          notables: [
              p("山本勘助", "山本", "勘助", "道鬼斋·军师", 56, 88, 84, 82, 78, ["Genius", "Strategist", "Tactician"], "Chancellor", "甲斐独眼军师"),
              p("马场信春", "马场", "信春", "美浓守", 46, 91, 78, 72, 86, ["BattleHardened", "Veteran", "Tactician"], "WarCommander", "不死鬼美浓·四天王"),
              p("山县昌景", "山县", "昌景", "三郎兵卫", 31, 93, 72, 66, 86, ["Brave", "BattleHardened", "Conqueror"], "WarCommander", "赤备队统帅"),
              p("内藤昌丰", "内藤", "昌丰", "修理亮", 38, 88, 80, 76, 82, ["Patient", "Tactician", "Veteran"], "WarCommander", "武田副将四天王"),
              p("高坂昌信", "高坂", "昌信", "弹正忠", 33, 86, 84, 80, 82, ["Tactician", "Administrator", "Patient"], "Treasurer", "逃弹正·海津城主"),
          ],
          families: [
              f("武田", "甲斐武田本家", 92, 80, ruling: true),
              f("山县", "赤备山县家", 72, 78),
              f("马场", "马场家", 70, 78),
          ],
          parties: [pt("甲斐谱代众", 58), pt("信浓国人众", 42)],
          power: pw(ind: 1.50, mp: 1.35, mil: 5, eco: 4, sta: 5, nav: 1, fleets: 0, ships: 2, navBonus: 0.0,
                    traits: ["CavalryTradition", "FieldCombatElite", "WellTrained"], lifetime: true, term: 40, warSupport: 86, startArmies: 6, maxArmies: 12)
        ))
        // 3 上杉
        out.append(n(3,
          founder: p("上杉谦信", "上杉", "谦信", "关东管领·越后之龙", 30, 99, 78, 78, 94, ["Genius", "Brave", "BattleHardened", "Just", "Tactician"], "Ruler", "军神·毗沙门天化身"),
          successors: [
              p("上杉景胜", "上杉", "景胜", "中纳言", 18, 84, 82, 76, 84, ["Stubborn", "Just", "Patient"], "Successor", "养子·米泽藩祖"),
          ],
          notables: [
              p("直江景纲", "直江", "景纲", "大和守", 51, 78, 88, 84, 82, ["Administrator", "Diligent", "Just"], "Chancellor", "越后内政大管家"),
              p("柿崎景家", "柿崎", "景家", "和泉守", 47, 92, 58, 56, 82, ["Brave", "BattleHardened", "Hawkish"], "WarCommander", "越后第一先锋"),
              p("宇佐美定满", "宇佐美", "定满", "骏河守", 58, 88, 82, 78, 80, ["Strategist", "Veteran", "Tactician"], "WarCommander", "越后军师"),
          ],
          families: [
              f("上杉", "长尾上杉本家", 90, 80, ruling: true),
              f("直江", "直江重臣家", 72, 78),
              f("柿崎", "柿崎将门", 66, 72),
          ],
          parties: [pt("春日山谱代众", 60), pt("扬北国人众", 40)],
          power: pw(ind: 1.35, mp: 1.20, mil: 5, eco: 4, sta: 4, nav: 2, fleets: 1, ships: 4, navBonus: 0.08,
                    traits: ["FieldCombatElite", "FightToTheEnd", "WellTrained"], lifetime: true, term: 40, warSupport: 86, startArmies: 5, maxArmies: 11)
        ))
        // 4 北条（修复旧版误写「尾张革新派」bug -> 史实「小田原评定众 / 相模谱代众」）
        out.append(n(4,
          founder: p("北条氏康", "北条", "氏康", "左京大夫·相模之狮", 45, 90, 95, 86, 92, ["Administrator", "Lawgiver", "Tactician", "Beloved"], "Ruler", "禄寿应稳·善政名君"),
          successors: [
              p("北条氏政", "北条", "氏政", "左京大夫", 22, 80, 84, 78, 78, ["Administrator", "Patient", "Stubborn"], "Successor", "嫡子"),
              p("北条氏直", "北条", "氏直", "左京大夫", 18, 76, 78, 78, 76, ["Patient", "Diplomatic"], "Successor", "五代家督"),
          ],
          notables: [
              p("北条纲成", "北条", "纲成", "左卫门大夫", 45, 92, 74, 68, 86, ["Brave", "BattleHardened", "Tactician"], "WarCommander", "地黄八幡·河越奇袭名将"),
              p("松田宪秀", "松田", "宪秀", "尾张守", 39, 76, 86, 80, 76, ["Administrator", "Financier"], "Chancellor", "小田原笔头家老"),
          ],
          families: [
              f("北条", "小田原北条本家", 92, 80, ruling: true),
              f("松田", "松田家老", 68, 72),
          ],
          parties: [pt("小田原评定众", 58), pt("相模谱代众", 42)],
          power: pw(ind: 1.70, mp: 1.40, mil: 4, eco: 5, sta: 5, nav: 2, fleets: 1, ships: 4, navBonus: 0.10,
                    traits: ["CoreDefense", "HomelandDefense", "StrengthenCore"], lifetime: true, term: 40, warSupport: 78, startArmies: 6, maxArmies: 12)
        ))
        // 5 毛利
        out.append(n(5,
          founder: p("毛利元就", "毛利", "元就", "陆奥守·谋神", 52, 92, 94, 97, 92, ["Genius", "Strategist", "MasterDiplomat", "Patient", "Visionary"], "Ruler", "西国第一谋神"),
          successors: [
              p("毛利隆元", "毛利", "隆元", "大膳大夫", 37, 76, 88, 84, 84, ["Administrator", "Just", "Benevolent"], "Successor", "长子"),
              p("毛利辉元", "毛利", "辉元", "中纳言", 18, 74, 82, 80, 80, ["Patient", "Administrator"], "Successor", "嫡孙·西军总大将"),
          ],
          notables: [
              p("吉川元春", "吉川", "元春", "骏河守", 30, 93, 72, 68, 86, ["Brave", "BattleHardened", "Tactician"], "WarCommander", "毛利两川·山阴之雄"),
              p("小早川隆景", "小早川", "隆景", "左卫门佐", 27, 88, 92, 92, 90, ["Genius", "Strategist", "NavalMastery", "Administrator"], "Chancellor", "毛利两川·智将"),
              p("村上武吉", "村上", "武吉", "能岛水军大将", 27, 88, 70, 72, 84, ["NavalMastery", "ShipMaster", "Brave"], "Admiral", "濑户内海霸主·村上水军"),
          ],
          families: [
              f("毛利", "安艺毛利本家", 90, 80, ruling: true),
              f("吉川", "吉川家", 74, 84),
              f("小早川", "小早川家", 74, 84),
              f("村上", "能岛村上水军", 66, 74),
          ],
          parties: [pt("毛利两川派", 50), pt("濑户水军众", 30), pt("安艺国人众", 20)],
          power: pw(ind: 1.55, mp: 1.30, mil: 4, eco: 4, sta: 5, nav: 5, fleets: 3, ships: 6, navBonus: 0.34,
                    traits: ["WellTrained", "HomelandDefense", "FieldCombatElite"], lifetime: true, term: 40, warSupport: 80, startArmies: 5, maxArmies: 11)
        ))
        // 6 三好
        out.append(n(6,
          founder: p("三好长庆", "三好", "长庆", "修理大夫", 38, 86, 88, 84, 86, ["Administrator", "Unifier", "Strategist"], "Ruler", "畿内霸主"),
          successors: [
              p("三好义兴", "三好", "义兴", "筑前守", 18, 78, 80, 78, 80, ["Brave", "Diligent"], "Successor", "嫡子"),
              p("三好义继", "三好", "义继", "左京大夫", 18, 72, 72, 70, 72, ["Ambitious", "Stubborn"], "Successor", "养子"),
          ],
          notables: [
              p("松永久秀", "松永", "久秀", "弹正忠", 50, 84, 88, 86, 78, ["Ambitious", "Tactician", "Administrator"], "Chancellor", "乱世枭雄·多闻山城主"),
              p("三好义贤", "三好", "义贤", "丰前守", 33, 84, 80, 76, 80, ["Brave", "Administrator"], "WarCommander", "实休·阿波镇守"),
          ],
          families: [
              f("三好", "阿波三好本家", 86, 80, ruling: true),
              f("松永", "松永家", 72, 54),
          ],
          parties: [pt("阿波三好众", 54), pt("堺港会合众", 46)],
          power: pw(ind: 1.55, mp: 1.15, mil: 4, eco: 5, sta: 4, nav: 3, fleets: 1, ships: 4, navBonus: 0.14,
                    traits: ["StrengthenCore", "WellTrained"], lifetime: true, term: 40, warSupport: 70, startArmies: 4, maxArmies: 9)
        ))
        // 7 岛津
        out.append(n(7,
          founder: p("岛津贵久", "岛津", "贵久", "陆奥守", 46, 86, 86, 82, 88, ["Administrator", "Unifier", "Visionary"], "Ruler", "萨摩中兴之祖"),
          successors: [
              p("岛津义久", "岛津", "义久", "修理大夫", 27, 88, 92, 90, 92, ["Strategist", "Administrator", "NaturalLeader", "Unifier"], "Successor", "岛津四兄弟长兄·九州霸主"),
              p("岛津义弘", "岛津", "义弘", "兵库头", 25, 96, 78, 74, 92, ["Brave", "BattleHardened", "Tactician"], "Successor", "鬼石曼子"),
          ],
          notables: [
              p("岛津义弘", "岛津", "义弘", "又四郎", 25, 96, 78, 74, 92, ["Brave", "BattleHardened", "Tactician"], "WarCommander", "岛津猛将·鬼石曼子"),
              p("岛津岁久", "岛津", "岁久", "左卫门督", 23, 84, 86, 84, 82, ["Strategist", "Patient"], "Chancellor", "智谋三弟"),
              p("岛津家久", "岛津", "家久", "中务大辅", 18, 93, 76, 72, 86, ["Genius", "Tactician", "BattleHardened"], "WarCommander", "钓鱼野伏奇才"),
          ],
          families: [
              f("岛津", "萨摩岛津本家", 92, 80, ruling: true),
              f("伊集院", "伊集院家老", 66, 72),
          ],
          parties: [pt("萨摩外城众", 66), pt("南蛮铁炮众", 34)],
          power: pw(ind: 1.35, mp: 1.25, mil: 5, eco: 4, sta: 4, nav: 3, fleets: 2, ships: 5, navBonus: 0.18,
                    traits: ["FightToTheEnd", "FieldCombatElite", "WellTrained"], lifetime: true, term: 40, warSupport: 88, startArmies: 4, maxArmies: 9)
        ))
        // 8 大友
        out.append(n(8,
          founder: p("大友宗麟", "大友", "宗麟", "左卫门督", 30, 80, 86, 90, 84, ["Diplomatic", "Financier", "Visionary", "SeaVision"], "Ruler", "九州吉利支丹大名"),
          successors: [
              p("大友义统", "大友", "义统", "左兵卫督", 18, 62, 68, 70, 66, ["Craven", "Extravagant"], "Successor", "嫡子"),
          ],
          notables: [
              p("立花道雪", "立花", "道雪", "户次鉴连", 47, 94, 84, 78, 92, ["Brave", "BattleHardened", "Just", "Tactician"], "WarCommander", "雷神·大友支柱"),
              p("高桥绍运", "高桥", "绍运", "主膳兵卫", 22, 90, 76, 74, 88, ["Brave", "BattleHardened", "Just"], "WarCommander", "岩屋城忠魂"),
          ],
          families: [
              f("大友", "丰后大友本家", 86, 80, ruling: true),
              f("立花", "立花家", 72, 82),
          ],
          parties: [pt("府内南蛮商派", 52), pt("丰后谱代众", 48)],
          power: pw(ind: 1.45, mp: 1.15, mil: 4, eco: 5, sta: 4, nav: 3, fleets: 2, ships: 5, navBonus: 0.16,
                    traits: ["CoreDefense", "WellTrained"], lifetime: true, term: 40, warSupport: 74, startArmies: 4, maxArmies: 9)
        ))
        // 9 伊达
        out.append(n(9,
          founder: p("伊达晴宗", "伊达", "晴宗", "左京大夫", 41, 78, 82, 80, 78, ["Administrator", "Diplomatic", "Patient"], "Ruler", "奥州探题"),
          successors: [
              p("伊达辉宗", "伊达", "辉宗", "左京大夫", 18, 80, 84, 86, 84, ["Diplomatic", "Just", "Benevolent"], "Successor", "嫡子"),
              p("伊达政宗", "伊达", "政宗", "独眼龙·陆奥守", 18, 94, 90, 88, 94, ["Genius", "Ambitious", "Conqueror", "Charismatic", "Tactician"], "Successor", "独眼龙政宗"),
          ],
          notables: [
              p("片仓景纲", "片仓", "景纲", "小十郎", 20, 84, 88, 88, 86, ["Strategist", "Administrator", "Just"], "Chancellor", "智之片仓"),
              p("鬼庭良直", "鬼庭", "良直", "左月斋", 47, 84, 76, 72, 82, ["Brave", "Veteran", "Just"], "WarCommander", "伊达老将"),
          ],
          families: [
              f("伊达", "米泽伊达本家", 88, 80, ruling: true),
              f("片仓", "片仓重臣家", 68, 80),
          ],
          parties: [pt("米泽谱代众", 56), pt("奥羽国人众", 44)],
          power: pw(ind: 1.25, mp: 1.15, mil: 4, eco: 4, sta: 4, nav: 2, fleets: 1, ships: 3, navBonus: 0.08,
                    traits: ["CavalryTradition", "Conqueror"], lifetime: true, term: 40, warSupport: 78, startArmies: 4, maxArmies: 9)
        ))
        // 10 长宗我部
        out.append(n(10,
          founder: p("长宗我部国亲", "长宗我部", "国亲", "宫内少辅", 52, 82, 82, 78, 82, ["Ambitious", "Administrator", "Patient"], "Ruler", "土佐中兴之主"),
          successors: [
              p("长宗我部元亲", "长宗我部", "元亲", "土佐守·姬若子", 21, 91, 86, 80, 90, ["Brave", "Unifier", "Tactician", "NaturalLeader"], "Successor", "四国霸主"),
          ],
          notables: [
              p("久武亲信", "久武", "亲信", "内藏助", 28, 78, 84, 80, 78, ["Administrator", "Just"], "Chancellor", "土佐家老"),
              p("香宗我部亲泰", "香宗我部", "亲泰", "安艺守", 18, 82, 80, 84, 80, ["Diplomatic", "Tactician"], "Diplomat", "元亲胞弟"),
          ],
          families: [
              f("长宗我部", "冈丰长宗我部家", 86, 80, ruling: true),
              f("久武", "久武家老", 64, 74),
          ],
          parties: [pt("一领具足众", 62), pt("土佐水军众", 38)],
          power: pw(ind: 1.10, mp: 1.05, mil: 4, eco: 3, sta: 4, nav: 3, fleets: 1, ships: 4, navBonus: 0.14,
                    traits: ["FightToTheEnd", "HomelandDefense"], lifetime: true, term: 40, warSupport: 80, startArmies: 3, maxArmies: 7)
        ))
        // 11 朝仓
        out.append(n(11,
          founder: p("朝仓义景", "朝仓", "义景", "左卫门督", 27, 64, 76, 76, 76, ["Scholar", "Patient", "Dovish"], "Ruler", "越前一乘谷之主"),
          successors: [
              p("朝仓景镜", "朝仓", "景镜", "式部大辅", 35, 74, 72, 70, 68, ["Ambitious", "Veteran"], "Successor", "一门众重臣"),
          ],
          notables: [
              p("朝仓宗滴", "朝仓", "宗滴", "教景·军神老将", 60, 92, 82, 76, 88, ["Veteran", "Strategist", "BattleHardened"], "WarCommander", "朝仓定海神针"),
              p("真柄直隆", "真柄", "直隆", "十郎左卫门", 24, 88, 52, 50, 76, ["Brave", "BattleHardened"], "WarCommander", "太郎太刀猛士"),
          ],
          families: [
              f("朝仓", "越前朝仓本家", 86, 80, ruling: true),
              f("鱼住", "鱼住家老", 60, 68),
          ],
          parties: [pt("一乘谷公家派", 56), pt("加贺一向宗门徒", 44)],
          power: pw(ind: 1.20, mp: 1.00, mil: 3, eco: 4, sta: 4, nav: 2, fleets: 1, ships: 3, navBonus: 0.06,
                    traits: ["CoreDefense", "HomelandDefense"], lifetime: true, term: 40, warSupport: 64, startArmies: 3, maxArmies: 7)
        ))
        // 12 斋藤
        out.append(n(12,
          founder: p("斋藤义龙", "斋藤", "义龙", "左京大夫", 33, 86, 80, 74, 80, ["Brave", "IronFist", "BattleHardened"], "Ruler", "美浓蝮蛇之子"),
          successors: [
              p("斋藤龙兴", "斋藤", "龙兴", "右兵卫大辅", 18, 62, 62, 64, 64, ["Stubborn", "Extravagant"], "Successor", "嫡子"),
          ],
          notables: [
              p("竹中半兵卫", "竹中", "重治", "半兵卫·军师", 18, 92, 88, 86, 86, ["Genius", "Strategist", "Tactician", "Scholar"], "Chancellor", "今孔明·十六人夺稻叶山"),
              p("稻叶一铁", "稻叶", "良通", "伊予守", 45, 86, 74, 70, 80, ["Stubborn", "BattleHardened", "Veteran"], "WarCommander", "西美浓三人众"),
          ],
          families: [
              f("斋藤", "美浓斋藤本家", 84, 80, ruling: true),
              f("竹中", "竹中家", 64, 68),
              f("稻叶", "西美浓稻叶家", 66, 62),
          ],
          parties: [pt("西美浓三人众", 54), pt("稻叶山谱代众", 46)],
          power: pw(ind: 1.25, mp: 1.00, mil: 4, eco: 4, sta: 3, nav: 1, fleets: 0, ships: 2, navBonus: 0.0,
                    traits: ["CoreDefense", "FieldCombatElite"], lifetime: true, term: 40, warSupport: 72, startArmies: 3, maxArmies: 7)
        ))
        // 13 龙造寺
        out.append(n(13,
          founder: p("龙造寺隆信", "龙造寺", "隆信", "山城守·肥前之熊", 31, 88, 74, 70, 84, ["Brave", "Hawkish", "BattleHardened", "IronFist"], "Ruler", "肥前之熊"),
          successors: [
              p("龙造寺政家", "龙造寺", "政家", "民部大辅", 18, 66, 72, 72, 70, ["Patient", "Dovish"], "Successor", "嫡子"),
              p("锅岛直茂", "锅岛", "直茂", "飞驒守", 22, 90, 90, 86, 88, ["Strategist", "Administrator", "Tactician"], "Successor", "佐贺藩实质开创者"),
          ],
          notables: [
              p("锅岛直茂", "锅岛", "直茂", "飞驒守", 22, 90, 90, 86, 88, ["Strategist", "Administrator", "Tactician"], "Chancellor", "龙造寺智囊"),
              p("成松信胜", "成松", "信胜", "远江守", 20, 86, 62, 58, 78, ["Brave", "BattleHardened"], "WarCommander", "龙造寺四天王"),
          ],
          families: [
              f("龙造寺", "肥前龙造寺家", 86, 80, ruling: true),
              f("锅岛", "锅岛重臣家", 74, 78),
          ],
          parties: [pt("肥前谱代众", 62), pt("有明海国人众", 38)],
          power: pw(ind: 1.15, mp: 1.10, mil: 4, eco: 4, sta: 4, nav: 2, fleets: 1, ships: 3, navBonus: 0.08,
                    traits: ["FieldCombatElite", "Conqueror"], lifetime: true, term: 40, warSupport: 78, startArmies: 3, maxArmies: 7)
        ))
        // 14 松平家（三河冈崎·德川家康）
        out.append(n(14,
          founder: p("松平元康", "松平", "元康", "藏人佐·德川家康", 18, 90, 94, 90, 88, ["Patient", "Strategist", "Administrator", "Lawgiver", "Unifier"], "Ruler", "三河松平家主·后为德川家康"),
          successors: [
              p("德川秀忠", "德川", "秀忠", "二代将军", 18, 78, 86, 84, 82, ["Patient", "Administrator", "Diligent"], "Successor", "嫡子"),
          ],
          notables: [
              p("本多忠胜", "本多", "忠胜", "平八郎", 18, 97, 68, 62, 90, ["Brave", "BattleHardened", "FieldCombatElite"], "WarCommander", "战国第一猛将·蜻蛉切"),
              p("酒井忠次", "酒井", "忠次", "左卫门尉", 33, 88, 82, 80, 84, ["Veteran", "Tactician", "Just"], "Chancellor", "德川四天王笔头"),
              p("石川数正", "石川", "数正", "伯耆守", 27, 76, 86, 88, 80, ["Diplomatic", "Administrator"], "Diplomat", "三河外交重臣"),
          ],
          families: [
              f("松平", "三河松平本家", 90, 82, ruling: true),
              f("酒井", "三河谱代酒井家", 74, 84),
              f("本多", "本多将门", 72, 86),
          ],
          parties: [pt("三河谱代武士团", 68), pt("三河一向宗门徒", 32)],
          power: pw(ind: 1.25, mp: 1.15, mil: 5, eco: 4, sta: 5, nav: 1, fleets: 0, ships: 2, navBonus: 0.04,
                    traits: ["WellTrained", "FightToTheEnd", "CoreDefense"], lifetime: true, term: 40, warSupport: 84, startArmies: 3, maxArmies: 8)
        ))
        // 15 足利幕府（京都室町幕府·剑豪将军足利义辉）
        out.append(n(15,
          founder: p("足利义辉", "足利", "义辉", "征夷大将军", 24, 90, 78, 84, 88, ["Brave", "Just", "NaturalLeader", "BattleHardened"], "Ruler", "剑豪将军·室町第十三代将军"),
          successors: [
              p("足利义昭", "足利", "义昭", "十五代将军", 23, 64, 72, 82, 76, ["Ambitious", "Diplomatic", "Stubborn"], "Successor", "胞弟·觉庆"),
          ],
          notables: [
              p("细川藤孝", "细川", "藤孝", "兵部大辅", 26, 84, 90, 92, 88, ["Scholar", "MasterDiplomat", "Tactician"], "Chancellor", "文武双全幕府重臣"),
              p("和田惟政", "和田", "惟政", "伊贺守", 24, 80, 78, 82, 80, ["Brave", "Just", "Diplomatic"], "WarCommander", "幕府奉公众忠臣"),
          ],
          families: [
              f("足利", "室町足利将军家", 90, 84, ruling: true),
              f("细川", "细川管领家", 76, 78),
          ],
          parties: [pt("幕府奉公众", 56), pt("京都公家朝廷派", 44)],
          power: pw(ind: 1.35, mp: 0.90, mil: 4, eco: 5, sta: 5, nav: 1, fleets: 0, ships: 2, navBonus: 0.04,
                    traits: ["CoreDefense", "StrengthenCore"], lifetime: true, term: 40, warSupport: 72, startArmies: 3, maxArmies: 6)
        ))
        // 16 浅井家（北近江小谷城）
        out.append(n(16,
          founder: p("浅井长政", "浅井", "长政", "备前守", 18, 86, 80, 82, 88, ["Brave", "Just", "Charismatic", "BattleHardened"], "Ruler", "北近江英主"),
          successors: [
              p("浅井万福丸", "浅井", "万福丸", "嫡子", 18, 70, 74, 74, 76, ["Just", "Patient"], "Successor", "嫡子"),
          ],
          notables: [
              p("矶野员昌", "矶野", "员昌", "丹波守", 37, 89, 70, 66, 82, ["Brave", "BattleHardened"], "WarCommander", "浅井家第一猛将"),
              p("远藤直经", "远藤", "直经", "喜右卫门", 29, 84, 82, 80, 80, ["Strategist", "Just", "Brave"], "Chancellor", "浅井忠烈智囊"),
          ],
          families: [
              f("浅井", "北近江浅井本家", 86, 82, ruling: true),
              f("矶野", "矶野将门", 68, 76),
          ],
          parties: [pt("北近江少壮派", 58), pt("浅井宿老国人众", 42)],
          power: pw(ind: 1.15, mp: 0.95, mil: 4, eco: 4, sta: 4, nav: 1, fleets: 0, ships: 2, navBonus: 0.04,
                    traits: ["FieldCombatElite", "HomelandDefense"], lifetime: true, term: 40, warSupport: 80, startArmies: 2, maxArmies: 6)
        ))
        // 17 六角家（南近江观音寺城）
        out.append(n(17,
          founder: p("六角义贤", "六角", "义贤", "左京大夫·承祯", 39, 78, 82, 84, 78, ["Administrator", "Diplomatic", "Patient"], "Ruler", "南近江名门守护"),
          successors: [
              p("六角义治", "六角", "义治", "右卫门督", 18, 70, 68, 70, 68, ["Stubborn", "Ambitious"], "Successor", "嫡子"),
          ],
          notables: [
              p("蒲生定秀", "蒲生", "定秀", "下野守", 52, 84, 86, 82, 82, ["Veteran", "Administrator", "Tactician"], "Chancellor", "日野城智将·蒲生氏乡祖父"),
              p("后藤贤丰", "后藤", "贤丰", "但马守", 42, 82, 82, 78, 80, ["Just", "Veteran"], "WarCommander", "六角两藤笔头"),
          ],
          families: [
              f("六角", "南近江六角守护家", 86, 80, ruling: true),
              f("蒲生", "日野蒲生家", 72, 74),
          ],
          parties: [pt("观音寺家臣众", 60), pt("甲贺国人忍者众", 40)],
          power: pw(ind: 1.25, mp: 0.95, mil: 3, eco: 5, sta: 4, nav: 1, fleets: 0, ships: 2, navBonus: 0.04,
                    traits: ["CoreDefense", "StrengthenCore"], lifetime: true, term: 40, warSupport: 66, startArmies: 2, maxArmies: 6)
        ))
        // 18 北畠家（伊势松坂·剑圣国司）
        out.append(n(18,
          founder: p("北畠具教", "北畠", "具教", "伊势国司·权中纳言", 32, 90, 76, 78, 84, ["Brave", "BattleHardened", "Scholar"], "Ruler", "冢原卜传高徒·剑圣国司"),
          successors: [
              p("北畠具房", "北畠", "具房", "伊势国司", 18, 66, 74, 76, 74, ["Patient", "Dovish"], "Successor", "嫡子"),
          ],
          notables: [
              p("藤方朝成", "藤方", "朝成", "刑部少辅", 36, 82, 78, 76, 78, ["Brave", "Just"], "WarCommander", "伊势国司谱代猛将"),
              p("九鬼嘉隆", "九鬼", "嘉隆", "右马允", 18, 88, 74, 72, 84, ["NavalMastery", "ShipMaster", "Brave"], "Admiral", "志摩九鬼水军名将"),
          ],
          families: [
              f("北畠", "伊势北畠国司家", 86, 82, ruling: true),
              f("九鬼", "志摩九鬼水军", 68, 72),
          ],
          parties: [pt("伊势国司公家派", 58), pt("志摩熊野水军众", 42)],
          power: pw(ind: 1.15, mp: 0.95, mil: 4, eco: 4, sta: 4, nav: 4, fleets: 2, ships: 4, navBonus: 0.22,
                    traits: ["HomelandDefense", "CoreDefense"], lifetime: true, term: 40, warSupport: 74, startArmies: 3, maxArmies: 6)
        ))
        // 19 尼子家（出云月山富田城）
        out.append(n(19,
          founder: p("尼子晴久", "尼子", "晴久", "修理大夫·八国守护", 46, 86, 84, 78, 84, ["BattleHardened", "Stubborn", "Administrator"], "Ruler", "山阴八国霸主"),
          successors: [
              p("尼子义久", "尼子", "义久", "右卫门督", 20, 72, 74, 72, 74, ["Stubborn", "Patient"], "Successor", "嫡子"),
          ],
          notables: [
              p("山中鹿介", "山中", "幸盛", "尼子十勇士之首", 18, 93, 72, 74, 92, ["Brave", "BattleHardened", "DefyTheStrong", "Just"], "WarCommander", "愿受七难八苦·山阴麒麟儿"),
              p("宇山久兼", "宇山", "久兼", "飞驒守", 48, 76, 86, 82, 80, ["Administrator", "Financier", "Just"], "Chancellor", "尼子忠臣家老"),
          ],
          families: [
              f("尼子", "出云尼子本家", 88, 80, ruling: true),
              f("山中", "山中忠烈家", 70, 86),
          ],
          parties: [pt("出云尼子谱代众", 60), pt("山阴国人领主众", 40)],
          power: pw(ind: 1.30, mp: 1.10, mil: 4, eco: 4, sta: 4, nav: 2, fleets: 1, ships: 3, navBonus: 0.08,
                    traits: ["HomelandDefense", "FightToTheEnd"], lifetime: true, term: 40, warSupport: 82, startArmies: 4, maxArmies: 8)
        ))
        // 20 宇喜多家（备前冈山）
        out.append(n(20,
          founder: p("宇喜多直家", "宇喜多", "直家", "和泉守", 31, 82, 88, 94, 80, ["Strategist", "Ambitious", "MasterDiplomat"], "Ruler", "战国三大枭雄·备前谋主"),
          successors: [
              p("宇喜多秀家", "宇喜多", "秀家", "备前宰相", 18, 84, 84, 84, 88, ["Brave", "Charismatic", "NaturalLeader"], "Successor", "丰臣五大老"),
          ],
          notables: [
              p("户川秀安", "户川", "秀安", "肥后守", 22, 84, 80, 76, 80, ["Brave", "Tactician"], "WarCommander", "宇喜多三老笔头"),
              p("长船贞亲", "长船", "贞亲", "越中守", 26, 74, 86, 84, 78, ["Administrator", "Financier"], "Chancellor", "备前内政柱石"),
          ],
          families: [
              f("宇喜多", "备前宇喜多本家", 86, 82, ruling: true),
              f("户川", "户川重臣家", 70, 78),
          ],
          parties: [pt("备前谋略新锐派", 62), pt("浦上旧臣众", 38)],
          power: pw(ind: 1.15, mp: 0.90, mil: 4, eco: 5, sta: 4, nav: 2, fleets: 1, ships: 3, navBonus: 0.10,
                    traits: ["CoreDefense", "WellTrained"], lifetime: true, term: 40, warSupport: 74, startArmies: 2, maxArmies: 6)
        ))
        // 21 佐竹家（常陆太田城·关东名门）
        out.append(n(21,
          founder: p("佐竹义昭", "佐竹", "义昭", "常陆介", 29, 82, 84, 82, 82, ["Veteran", "Patient", "Administrator"], "Ruler", "常陆清和源氏宗主"),
          successors: [
              p("佐竹义重", "佐竹", "义重", "鬼义重·常陆介", 18, 93, 84, 80, 88, ["Brave", "BattleHardened", "Conqueror"], "Successor", "坂东太郎·鬼义重"),
          ],
          notables: [
              p("真壁氏干", "真壁", "氏干", "鬼真壁", 18, 90, 64, 60, 82, ["Brave", "BattleHardened"], "WarCommander", "常陆猛将·鬼真壁"),
              p("和田昭为", "和田", "昭为", "安房守", 28, 76, 84, 84, 78, ["Diplomatic", "Administrator"], "Chancellor", "佐竹家老"),
          ],
          families: [
              f("佐竹", "常陆佐竹源氏", 88, 82, ruling: true),
              f("真壁", "真壁将门", 68, 78),
          ],
          parties: [pt("常陆宗室谱代众", 60), pt("北关东联军派", 40)],
          power: pw(ind: 1.25, mp: 1.05, mil: 4, eco: 4, sta: 4, nav: 2, fleets: 1, ships: 3, navBonus: 0.08,
                    traits: ["HomelandDefense", "FieldCombatElite"], lifetime: true, term: 40, warSupport: 78, startArmies: 3, maxArmies: 7)
        ))
        // 22 最上家（出羽山形城）
        out.append(n(22,
          founder: p("最上义守", "最上", "义守", "出羽守", 39, 76, 80, 84, 78, ["Diplomatic", "Patient"], "Ruler", "出羽探题"),
          successors: [
              p("最上义光", "最上", "义光", "出羽守·羽州之狐", 18, 91, 90, 94, 88, ["Genius", "MasterDiplomat", "Strategist", "Brave"], "Successor", "出羽之狐·长谷堂名将"),
          ],
          notables: [
              p("志村光安", "志村", "光安", "伊豆守", 26, 88, 80, 74, 84, ["Brave", "BattleHardened", "Tactician"], "WarCommander", "长谷堂死守名将"),
              p("鲑延秀纲", "鲑延", "秀纲", "越前守", 20, 86, 74, 72, 82, ["Brave", "Just"], "WarCommander", "最上笔头猛将"),
          ],
          families: [
              f("最上", "山形最上本家", 86, 80, ruling: true),
              f("志村", "志村重臣家", 68, 80),
          ],
          parties: [pt("山形最上谱代众", 58), pt("庄内酒田商港派", 42)],
          power: pw(ind: 1.10, mp: 0.95, mil: 4, eco: 4, sta: 4, nav: 2, fleets: 1, ships: 3, navBonus: 0.08,
                    traits: ["CoreDefense", "HomelandDefense"], lifetime: true, term: 40, warSupport: 74, startArmies: 3, maxArmies: 6)
        ))
        // 23 南部家（陆奥三户·盛冈）
        out.append(n(23,
          founder: p("南部晴政", "南部", "晴政", "大膳大夫", 43, 86, 80, 76, 84, ["Conqueror", "Brave", "BattleHardened"], "Ruler", "三日月圆如满月·奥北霸主"),
          successors: [
              p("南部信直", "南部", "信直", "大膳大夫", 18, 82, 86, 86, 84, ["Diplomatic", "Administrator", "Patient"], "Successor", "盛冈藩祖"),
          ],
          notables: [
              p("石川高信", "石川", "高信", "左卫门尉", 52, 84, 80, 76, 82, ["Veteran", "BattleHardened"], "WarCommander", "津轻镇守名将"),
              p("北信爱", "北", "信爱", "尾张守", 37, 80, 86, 84, 82, ["Just", "Administrator", "Diplomatic"], "Chancellor", "南部家忠臣智囊"),
          ],
          families: [
              f("南部", "陆奥南部本家", 88, 80, ruling: true),
              f("北", "北氏家老", 68, 82),
          ],
          parties: [pt("糠部铁骑众", 64), pt("津轻国人众", 36)],
          power: pw(ind: 1.05, mp: 1.00, mil: 4, eco: 3, sta: 4, nav: 2, fleets: 1, ships: 3, navBonus: 0.06,
                    traits: ["CavalryTradition", "HomelandDefense"], lifetime: true, term: 40, warSupport: 78, startArmies: 3, maxArmies: 7)
        ))
        return out
    }()

    // MARK: - 剧本 6：拿破仑战争 · 远征莫斯科（公元 1812 年，10 国）

    private static let napoleon1812: [HistoricalNationRoster] = [
        // 0 法兰西第一帝国
        n(0,
          founder: p("拿破仑·波拿巴", "波拿巴", "拿破仑", "法兰西皇帝", 43, 99, 94, 86, 97, ["Genius", "Conqueror", "Strategist", "Lawgiver", "Charismatic"], "Ruler", "法兰西第一帝国皇帝"),
          successors: [
              p("约瑟夫·波拿巴", "波拿巴", "约瑟夫", "帝国摄政王", 44, 66, 80, 82, 78, ["Diplomatic", "Administrator", "Benevolent"], "Successor", "皇兄"),
              p("拿破仑二世", "波拿巴", "拿破仑·弗朗索瓦", "罗马王", 18, 76, 78, 76, 84, ["Ambitious", "Charismatic", "Brave"], "Successor", "皇太子"),
              p("路易十八", "波旁", "路易", "法兰西国王", 56, 56, 80, 84, 76, ["Patient", "Diplomatic", "Lawgiver"], "Successor", "波旁复辟君主"),
          ],
          notables: [
              p("路易·达武", "达武", "路易·尼古拉", "奥尔施泰特公爵·元帅", 42, 96, 82, 68, 86, ["Genius", "BattleHardened", "Tactician", "IronFist"], "WarCommander", "铁帅·从未战败"),
              p("安德烈·马塞纳", "马塞纳", "安德烈", "埃斯林亲王·元帅", 54, 92, 70, 68, 84, ["BattleHardened", "Veteran", "Tactician"], "WarCommander", "胜利宠儿"),
              p("若阿尚·缪拉", "缪拉", "若阿尚", "那不勒斯国王·元帅", 45, 91, 64, 70, 92, ["Brave", "BattleHardened", "Charismatic"], "WarCommander", "第一骑兵元帅"),
              p("米歇尔·内伊", "内伊", "米歇尔", "莫斯科河亲王·元帅", 43, 90, 64, 62, 92, ["Brave", "BattleHardened", "NaturalLeader"], "WarCommander", "勇士中之勇士"),
              p("路易·贝尔蒂埃", "贝尔蒂埃", "路易·亚历山大", "帝国总参谋长", 58, 84, 92, 76, 80, ["Administrator", "Diligent", "Strategist"], "Treasurer", "拿破仑首席参谋长"),
              p("夏尔·塔列朗", "塔列朗", "夏尔·莫里斯", "外交大臣", 58, 52, 86, 95, 86, ["MasterDiplomat", "Visionary", "Patient"], "Diplomat", "欧洲外交奇才"),
          ],
          families: [
              f("波拿巴", "波拿巴皇室", 94, 80, ruling: true),
              f("达武", "帝国元帅勋贵", 76, 78),
              f("塔列朗", "旧贵族外交世家", 68, 54),
              f("波旁", "波旁保王派", 60, 38),
          ],
          parties: [pt("波拿巴皇室", 46), pt("帝国元帅团", 26), pt("共和派", 16), pt("保王派", 12)],
          power: pw(ind: 2.90, mp: 1.85, mil: 6, eco: 5, sta: 5, nav: 4, fleets: 3, ships: 6, navBonus: 0.20,
                    traits: ["Conqueror", "FieldCombatElite", "WellTrained", "SiegeCapture"], lifetime: true, term: 40, warSupport: 86)
        ),
        // 1 俄罗斯帝国
        n(1,
          founder: p("亚历山大一世", "罗曼诺夫", "亚历山大", "全俄沙皇", 35, 76, 82, 86, 86, ["Diplomatic", "Stubborn", "Visionary", "NaturalLeader"], "Ruler", "全俄罗斯皇帝"),
          successors: [
              p("尼古拉一世", "罗曼诺夫", "尼古拉", "全俄沙皇", 26, 80, 82, 74, 80, ["IronFist", "Hawkish", "Stubborn"], "Successor", "皇弟·铁腕沙皇"),
              p("亚历山大二世", "罗曼诺夫", "亚历山大", "全俄沙皇", 24, 74, 88, 84, 86, ["Reformer", "Benevolent", "Lawgiver"], "Successor", "解放者沙皇"),
          ],
          notables: [
              p("米哈伊尔·库图佐夫", "库图佐夫", "米哈伊尔", "帝国元帅", 60, 94, 82, 84, 92, ["Genius", "Strategist", "Patient", "Veteran", "Beloved"], "WarCommander", "卫国战争总司令"),
              p("巴克莱·德托利", "德托利", "米哈伊尔", "陆军大臣", 51, 88, 84, 76, 80, ["Strategist", "Patient", "Administrator"], "Chancellor", "焦土抗敌策划者"),
              p("彼得·巴格拉季昂", "巴格拉季昂", "彼得", "步兵上将", 47, 90, 68, 66, 88, ["Brave", "BattleHardened", "NaturalLeader"], "WarCommander", "第二西方集团军司令"),
              p("阿列克谢·叶尔莫洛夫", "叶尔莫洛夫", "阿列克谢", "炮兵名将", 35, 86, 72, 66, 84, ["Brave", "Tactician", "IronFist"], "WarCommander", "博罗季诺勇将"),
          ],
          families: [
              f("罗曼诺夫", "罗曼诺夫皇室", 92, 80, ruling: true),
              f("戈利岑", "戈利岑大公爵家", 72, 70),
              f("库图佐夫", "库图佐夫勋贵", 68, 78),
          ],
          parties: [pt("罗曼诺夫皇室", 46), pt("帝国近卫军", 26), pt("斯拉夫贵族派", 18), pt("宫廷改革派", 10)],
          power: pw(ind: 1.05, mp: 1.95, mil: 4, eco: 3, sta: 4, nav: 3, fleets: 2, ships: 5, navBonus: 0.14,
                    traits: ["HomelandDefense", "FightToTheEnd", "CoreDefense"], lifetime: true, term: 40, warSupport: 88)
        ),
        // 2 大英帝国（君主立宪双首脑：摄政王乔治四世为君主，利物浦勋爵任首相掌政）
        n(2,
          founder: p("乔治四世", "汉诺威", "乔治", "摄政王·国王", 50, 62, 72, 78, 80, ["Extravagant", "Diplomatic", "Charismatic"], "Ruler", "汉诺威王室摄政王"),
          successors: [
              p("威廉四世", "汉诺威", "威廉", "英国国王", 47, 74, 76, 78, 80, ["NavalMastery", "Reformer", "Just"], "Successor", "水手国王"),
              p("维多利亚", "汉诺威", "维多利亚", "英国女王", 20, 68, 86, 88, 92, ["Visionary", "Stubborn", "Beloved"], "Successor", "日不落帝国女王", gender: 1),
          ],
          notables: [
              p("罗伯特·利物浦", "詹金逊", "罗伯特", "大英帝国首相", 42, 70, 90, 88, 84, ["Administrator", "Patient", "Financier", "Diplomatic"], "Chancellor", "利物浦勋爵·托利党首相"),
              p("阿瑟·威灵顿", "韦尔斯利", "阿瑟", "威灵顿公爵·元帅", 43, 95, 84, 84, 90, ["Genius", "Strategist", "BattleHardened", "Patient"], "WarCommander", "伊比利亚半岛总司令"),
              p("卡斯伯特·科林伍德", "科林伍德", "卡斯伯特", "皇家海军上将", 56, 92, 78, 76, 86, ["NavalMastery", "ShipMaster", "Veteran"], "Admiral", "地中海舰队司令"),
              p("爱德华·佩柳", "佩柳", "爱德华", "埃克斯茅斯子爵·上将", 55, 90, 74, 72, 84, ["NavalMastery", "ShipMaster", "Brave"], "Admiral", "皇家海军名将"),
              p("罗伯特·卡斯尔雷", "斯图尔特", "罗伯特", "外交大臣", 43, 64, 86, 92, 82, ["MasterDiplomat", "Administrator", "Visionary"], "Diplomat", "反法同盟缔造者"),
              p("尼古拉斯·范西塔特", "范西塔特", "尼古拉斯", "财政大臣", 46, 54, 88, 76, 74, ["Financier", "Administrator", "Diligent"], "Treasurer", "战时财政支柱"),
          ],
          families: [
              f("汉诺威", "汉诺威王室", 86, 80, ruling: true),
              f("詹金逊", "托利党执政内阁", 78, 78),
              f("韦尔斯利", "威灵顿公爵世家", 74, 78),
              f("皮特", "议会贵族世家", 70, 72),
          ],
          parties: [pt("托利党", 62), pt("辉格党", 38)],
          power: pw(ind: 3.20, mp: 1.25, mil: 5, eco: 6, sta: 6, nav: 6, fleets: 5, ships: 9, navBonus: 0.42,
                    traits: ["WellTrained", "StrengthenCore", "HomelandDefense"], lifetime: true, term: 40, warSupport: 82)
        ),
        // 3 奥地利帝国
        n(3,
          founder: p("弗朗茨一世", "哈布斯堡", "弗朗茨", "奥地利皇帝", 44, 68, 80, 82, 78, ["Patient", "Stubborn", "Administrator"], "Ruler", "哈布斯堡皇帝"),
          successors: [
              p("斐迪南一世", "哈布斯堡", "斐迪南", "奥地利皇帝", 22, 54, 66, 70, 68, ["Benevolent", "Patient"], "Successor", "皇太子"),
              p("弗朗茨·约瑟夫一世", "哈布斯堡", "弗朗茨·约瑟夫", "奥地利皇帝", 22, 74, 84, 82, 84, ["Diligent", "Stubborn", "Just"], "Successor", "长寿明君"),
          ],
          notables: [
              p("克莱门斯·梅特涅", "梅特涅", "克莱门斯", "帝国首相·外交大臣", 39, 60, 90, 96, 88, ["Genius", "MasterDiplomat", "Visionary", "Patient"], "Chancellor", "维也纳体系总设计师"),
              p("卡尔大公", "哈布斯堡", "卡尔", "帝国元帅", 41, 92, 82, 76, 88, ["Strategist", "Tactician", "Reformer", "BattleHardened"], "WarCommander", "阿斯佩恩击败拿破仑名帅"),
              p("卡尔·施瓦岑贝格", "施瓦岑贝格", "卡尔", "联军总司令·元帅", 41, 86, 80, 84, 84, ["Diplomatic", "Veteran", "Patient"], "WarCommander", "莱比锡诸国大战联军统帅"),
          ],
          families: [
              f("哈布斯堡", "哈布斯堡皇室", 92, 80, ruling: true),
              f("梅特涅", "梅特涅亲王世家", 76, 78),
              f("施瓦岑贝格", "波希米亚大贵族", 70, 74),
          ],
          parties: [pt("哈布斯堡宫廷", 46), pt("梅特涅保守派", 32), pt("帝国军官团", 22)],
          power: pw(ind: 1.75, mp: 1.50, mil: 5, eco: 4, sta: 5, nav: 2, fleets: 1, ships: 4, navBonus: 0.08,
                    traits: ["WellTrained", "CoreDefense"], lifetime: true, term: 40, warSupport: 68)
        ),
        // 4 普鲁士王国
        n(4,
          founder: p("腓特烈·威廉三世", "霍亨索伦", "腓特烈·威廉", "普鲁士国王", 42, 72, 80, 78, 76, ["Patient", "Reformer", "Diligent"], "Ruler", "普鲁士国王"),
          successors: [
              p("腓特烈·威廉四世", "霍亨索伦", "腓特烈·威廉", "普鲁士国王", 24, 66, 76, 78, 78, ["Scholar", "Stubborn"], "Successor", "王太子"),
              p("威廉一世", "霍亨索伦", "威廉", "德意志皇帝", 26, 82, 86, 84, 88, ["Just", "Veteran", "Unifier"], "Successor", "德意志统一之君"),
          ],
          notables: [
              p("格布哈德·布吕歇尔", "布吕歇尔", "格布哈德", "陆军元帅", 62, 92, 64, 62, 92, ["Brave", "BattleHardened", "Veteran", "Hawkish"], "WarCommander", "前进元帅"),
              p("格哈德·沙恩霍斯特", "沙恩霍斯特", "格哈德", "总参谋长", 56, 90, 92, 80, 84, ["Genius", "Reformer", "Strategist", "Visionary"], "Chancellor", "普鲁士军事改革之父"),
              p("奥古斯特·格奈森瑙", "格奈森瑙", "奥古斯特", "陆军元帅", 51, 91, 86, 78, 86, ["Strategist", "Tactician", "Diligent"], "WarCommander", "现代总参谋部奠基者"),
              p("卡尔·哈登贝格", "哈登贝格", "卡尔·奥古斯特", "王国宰相", 60, 56, 90, 88, 82, ["Administrator", "Reformer", "Financier"], "Treasurer", "普鲁士改革宰相"),
          ],
          families: [
              f("霍亨索伦", "霍亨索伦王室", 90, 80, ruling: true),
              f("布吕歇尔", "容克军官世家", 74, 78),
              f("哈登贝格", "普鲁士改革派贵族", 68, 76),
          ],
          parties: [pt("容克贵族派", 42), pt("军事改革派", 34), pt("霍亨索伦王党", 24)],
          power: pw(ind: 1.90, mp: 1.25, mil: 5, eco: 5, sta: 5, nav: 2, fleets: 1, ships: 3, navBonus: 0.08,
                    traits: ["WellTrained", "FieldCombatElite", "FightToTheEnd"], lifetime: true, term: 40, warSupport: 82)
        ),
        // 5 西班牙
        n(5,
          founder: p("费尔南多七世", "波旁", "费尔南多", "西班牙国王", 28, 60, 66, 68, 70, ["Stubborn", "Paranoid"], "Ruler", "西班牙波旁国王"),
          successors: [
              p("伊莎贝拉二世", "波旁", "伊莎贝拉", "西班牙女王", 18, 56, 68, 72, 72, ["Charismatic", "Stubborn"], "Successor", "女王", gender: 1),
          ],
          notables: [
              p("弗朗西斯科·卡斯塔尼奥斯", "卡斯塔尼奥斯", "弗朗西斯科", "拜伦公爵·上将", 54, 84, 74, 72, 82, ["BattleHardened", "Veteran", "Tactician"], "WarCommander", "拜伦大捷名将"),
              p("阿古斯丁·阿奎莱斯", "阿奎莱斯", "阿古斯丁", "加的斯议会领袖", 36, 56, 84, 84, 82, ["Reformer", "Lawgiver", "Scholar"], "Chancellor", "1812宪法起草领袖"),
          ],
          families: [
              f("波旁", "西班牙波旁王室", 82, 80, ruling: true),
              f("阿尔巴", "西班牙大贵族", 68, 66),
          ],
          parties: [pt("游击爱国派", 44), pt("加的斯自由派", 30), pt("西班牙王党", 26)],
          power: pw(ind: 1.15, mp: 1.15, mil: 3, eco: 3, sta: 3, nav: 3, fleets: 2, ships: 5, navBonus: 0.14,
                    traits: ["HomelandDefense", "FightToTheEnd"], lifetime: true, term: 40, warSupport: 80)
        ),
        // 6 葡萄牙
        n(6,
          founder: p("若昂六世", "布拉干萨", "若昂", "摄政王·国王", 45, 62, 78, 82, 76, ["Patient", "Diplomatic", "Financier"], "Ruler", "葡萄牙-巴西王国君主"),
          successors: [
              p("佩德罗四世", "布拉干萨", "佩德罗", "国王", 24, 78, 80, 78, 84, ["Brave", "Reformer", "Charismatic"], "Successor", "长子"),
          ],
          notables: [
              p("威廉·贝雷斯福德", "贝雷斯福德", "威廉", "葡萄牙陆军元帅", 44, 84, 78, 74, 78, ["Veteran", "BattleHardened", "Administrator"], "WarCommander", "葡军重整总司令"),
              p("帕尔梅拉公爵", "索萨", "佩德罗", "外交大臣", 31, 56, 82, 88, 80, ["MasterDiplomat", "Scholar"], "Diplomat", "葡萄牙名外交家"),
          ],
          families: [
              f("布拉干萨", "布拉干萨王室", 86, 80, ruling: true),
              f("帕尔梅拉", "葡萄牙航海贵族", 64, 72),
          ],
          parties: [pt("布拉干萨王党", 58), pt("立宪自由派", 42)],
          power: pw(ind: 0.95, mp: 0.85, mil: 3, eco: 4, sta: 4, nav: 4, fleets: 2, ships: 5, navBonus: 0.20,
                    traits: ["CoreDefense", "HomelandDefense"], lifetime: true, term: 40, warSupport: 70)
        ),
        // 7 奥斯曼帝国
        n(7,
          founder: p("马哈茂德二世", "奥斯曼", "马哈茂德", "苏丹·哈里发", 27, 74, 86, 80, 82, ["Reformer", "IronFist", "Visionary", "Stubborn"], "Ruler", "奥斯曼近代改革苏丹"),
          successors: [
              p("阿卜杜勒-迈吉德一世", "奥斯曼", "阿卜杜勒-迈吉德", "苏丹", 22, 66, 82, 82, 80, ["Reformer", "Benevolent", "Lawgiver"], "Successor", "坦志麦特改革苏丹"),
          ],
          notables: [
              p("胡尔希德帕夏", "胡尔希德", "艾哈迈德", "大维齐尔", 52, 80, 78, 74, 78, ["Veteran", "IronFist"], "Chancellor", "奥斯曼帝国首相"),
              p("穆罕默德·阿里", "卡瓦拉", "穆罕默德·阿里", "埃及总督", 43, 88, 90, 84, 88, ["Genius", "Reformer", "Ambitious", "Administrator"], "WarCommander", "近代埃及奠基人"),
          ],
          families: [
              f("奥斯曼", "奥斯曼皇室", 90, 80, ruling: true),
              f("科普鲁律", "帝国维齐尔世家", 66, 68),
          ],
          parties: [pt("苏丹新军派", 42), pt("近卫军旧派", 32), pt("乌里玛教团", 26)],
          power: pw(ind: 1.00, mp: 1.45, mil: 2, eco: 2, sta: 3, nav: 2, fleets: 2, ships: 5, navBonus: 0.10,
                    traits: ["HomelandDefense", "CoreDefense"], lifetime: true, term: 40, warSupport: 66)
        ),
        // 8 瑞典
        n(8,
          founder: p("卡尔十四世·贝尔纳多特", "贝尔纳多特", "让-巴蒂斯特", "王储摄政·国王", 49, 88, 86, 90, 88, ["MasterDiplomat", "Strategist", "Administrator", "Veteran"], "Ruler", "前法国元帅·瑞典王室始祖"),
          successors: [
              p("奥斯卡一世", "贝尔纳多特", "奥斯卡", "瑞典-挪威国王", 24, 70, 84, 82, 82, ["Reformer", "Benevolent", "Diplomatic"], "Successor", "王太子"),
          ],
          notables: [
              p("库尔特·冯·施泰丁克", "施泰丁克", "库尔特", "帝国元帅", 62, 84, 78, 82, 82, ["Veteran", "Diplomatic"], "WarCommander", "瑞典陆军元帅"),
              p("拉尔斯·冯·恩格斯特伦", "恩格斯特伦", "拉尔斯", "外交大臣", 60, 56, 84, 86, 78, ["Diplomatic", "Administrator"], "Diplomat", "瑞典重臣"),
          ],
          families: [
              f("贝尔纳多特", "贝尔纳多特王室", 86, 80, ruling: true),
              f("布拉赫", "瑞典贵族院世家", 66, 72),
          ],
          parties: [pt("宫廷王党", 48), pt("贵族议会派", 30), pt("市民自由派", 22)],
          power: pw(ind: 1.25, mp: 0.90, mil: 4, eco: 4, sta: 5, nav: 4, fleets: 2, ships: 5, navBonus: 0.18,
                    traits: ["WellTrained", "HomelandDefense"], lifetime: true, term: 40, warSupport: 70)
        ),
        // 9 丹麦-挪威
        n(9,
          founder: p("弗雷德里克六世", "奥尔登堡", "弗雷德里克", "丹麦-挪威国王", 44, 72, 82, 74, 78, ["Diligent", "Reformer", "Stubborn"], "Ruler", "奥尔登堡君主"),
          successors: [
              p("克里斯蒂安八世", "奥尔登堡", "克里斯蒂安", "丹麦国王", 26, 68, 82, 80, 80, ["Scholar", "Administrator", "Diplomatic"], "Successor", "王室继承人"),
          ],
          notables: [
              p("斯蒂恩·比勒", "比勒", "斯蒂恩", "海军中将", 58, 84, 74, 72, 80, ["NavalMastery", "Veteran", "Brave"], "Admiral", "丹麦皇家海军名将"),
              p("尼尔斯·罗森克兰茨", "罗森克兰茨", "尼尔斯", "外交大臣", 54, 54, 80, 84, 76, ["Diplomatic", "Patient"], "Diplomat", "哥本哈根重臣"),
          ],
          families: [
              f("奥尔登堡", "奥尔登堡王室", 86, 80, ruling: true),
              f("比勒", "丹麦海军贵族", 64, 74),
          ],
          parties: [pt("奥尔登堡王室", 58), pt("海运商团派", 42)],
          power: pw(ind: 1.05, mp: 0.80, mil: 3, eco: 4, sta: 4, nav: 4, fleets: 2, ships: 5, navBonus: 0.20,
                    traits: ["CoreDefense", "HomelandDefense"], lifetime: true, term: 40, warSupport: 68)
        ),
    ]

    // MARK: - 剧本 7：第一次世界大战 · 欧陆烽烟（公元 1914 年，14 国）

    private static let ww1_1914: [HistoricalNationRoster] = [
        // 0 德意志帝国
        n(0,
          founder: p("威廉二世", "霍亨索伦", "威廉", "德意志皇帝", 55, 76, 80, 68, 84, ["Ambitious", "Hawkish", "Stubborn", "SeaVision"], "Ruler", "德意志第二帝国皇帝"),
          successors: [
              p("弗里德里希·艾伯特", "艾伯特", "弗里德里希", "魏玛总统", 43, 62, 86, 84, 82, ["Administrator", "Patient", "Reformer"], "Successor", "社民党领袖·首任总统"),
              p("保罗·冯·兴登堡", "兴登堡", "保罗", "帝国总统·元帅", 64, 94, 78, 76, 92, ["Veteran", "BattleHardened", "NaturalLeader"], "Successor", "坦能堡英雄"),
          ],
          notables: [
              p("保罗·冯·兴登堡", "兴登堡", "保罗", "陆军元帅", 62, 94, 78, 74, 92, ["Strategist", "BattleHardened", "Veteran", "NaturalLeader"], "WarCommander", "东线胜利之父"),
              p("埃里希·鲁登道夫", "鲁登道夫", "埃里希", "总军需总监·上将", 49, 93, 86, 66, 82, ["Genius", "Strategist", "Tactician", "IronFist"], "WarCommander", "德军实际作战大脑"),
              p("奥古斯特·冯·马肯森", "马肯森", "奥古斯特", "陆军元帅", 62, 91, 72, 70, 88, ["Brave", "BattleHardened", "Tactician"], "WarCommander", "东线与巴尔干常胜帅"),
              p("阿尔弗雷德·冯·提尔皮茨", "提尔皮茨", "阿尔弗雷德", "海军元帅", 62, 88, 90, 76, 84, ["NavalMastery", "ShipMaster", "Visionary", "Administrator"], "Admiral", "公海舰队之父"),
              p("赖因哈德·舍尔", "舍尔", "赖因哈德", "公海舰队总司令", 51, 90, 76, 70, 84, ["NavalMastery", "Tactician", "Brave"], "Admiral", "日德兰海战指挥官"),
              p("特奥巴尔德·贝特曼-霍尔维格", "贝特曼-霍尔维格", "特奥巴尔德", "帝国首相", 57, 56, 84, 78, 76, ["Administrator", "Patient", "Diligent"], "Chancellor", "德意志帝国宰相"),
          ],
          families: [
              f("霍亨索伦", "霍亨索伦皇室", 92, 80, ruling: true),
              f("克虏伯", "鲁尔军工世家", 78, 80),
              f("兴登堡", "普鲁士容克将门", 74, 78),
          ],
          parties: [pt("社会民主党", 35), pt("中央党", 28), pt("德意志保守党", 22), pt("国家自由党", 15)],
          power: pw(ind: 3.30, mp: 1.75, mil: 6, eco: 6, sta: 5, nav: 5, fleets: 4, ships: 8, navBonus: 0.32,
                    traits: ["WellTrained", "FieldCombatElite", "SiegeCapture", "Conqueror"], lifetime: true, term: 40, warSupport: 88)
        ),
        // 1 奥匈帝国
        n(1,
          founder: p("弗朗茨·约瑟夫一世", "哈布斯堡", "弗朗茨·约瑟夫", "奥匈皇帝", 62, 70, 84, 80, 86, ["Diligent", "Stubborn", "Veteran", "Just"], "Ruler", "二元帝国老皇帝"),
          successors: [
              p("卡尔一世", "哈布斯堡", "卡尔", "奥匈皇帝", 27, 72, 78, 84, 82, ["Benevolent", "Dovish", "Reformer"], "Successor", "末代奥匈皇帝"),
          ],
          notables: [
              p("康拉德·冯·赫岑多夫", "赫岑多夫", "康拉德", "总参谋长·元帅", 61, 84, 76, 62, 78, ["Hawkish", "Strategist", "Stubborn"], "WarCommander", "奥匈总参谋长"),
              p("斯韦托扎尔·博罗耶维奇", "博罗耶维奇", "斯韦托扎尔", "陆军元帅", 57, 90, 74, 68, 86, ["BattleHardened", "Patient", "Tactician"], "WarCommander", "伊松佐河雄狮"),
              p("伊什特万·蒂萨", "蒂萨", "伊什特万", "匈牙利首相", 53, 64, 84, 80, 80, ["IronFist", "Administrator", "Stubborn"], "Chancellor", "匈牙利强人首相"),
          ],
          families: [
              f("哈布斯堡", "哈布斯堡皇室", 90, 80, ruling: true),
              f("蒂萨", "匈牙利贵族世家", 72, 68),
          ],
          parties: [pt("基督教社会党", 34), pt("匈牙利独立党", 26), pt("德意志自由党", 22), pt("帝国皇室派", 18)],
          power: pw(ind: 1.85, mp: 1.50, mil: 4, eco: 4, sta: 4, nav: 3, fleets: 2, ships: 5, navBonus: 0.14,
                    traits: ["CoreDefense", "WellTrained"], lifetime: true, term: 40, warSupport: 72)
        ),
        // 2 奥斯曼帝国（苏丹穆罕默德五世在位，恩维尔帕夏与三巨头把持军政）
        n(2,
          founder: p("穆罕默德五世", "奥斯曼", "穆罕默德", "苏丹·哈里发", 64, 58, 66, 68, 72, ["Patient", "Dovish"], "Ruler", "奥斯曼立宪苏丹"),
          successors: [
              p("穆罕默德六世", "奥斯曼", "瓦希德丁", "苏丹", 53, 56, 66, 68, 68, ["Patient", "Paranoid"], "Successor", "末代奥斯曼苏丹"),
              p("穆斯塔法·凯末尔", "阿塔图尔克", "穆斯塔法·凯末尔", "土耳其国父·元帅", 33, 95, 94, 90, 96, ["Genius", "Reformer", "Tactician", "Unifier", "Visionary"], "Successor", "加里波利胜帅·国父"),
          ],
          notables: [
              p("恩维尔帕夏", "恩维尔", "伊斯梅尔", "战争大臣·副总司令", 33, 80, 76, 72, 82, ["Ambitious", "Hawkish", "Brave"], "Chancellor", "青年土耳其三巨头"),
              p("穆斯塔法·凯末尔", "阿塔图尔克", "穆斯塔法·凯末尔", "第19师师长·名将", 33, 95, 94, 90, 96, ["Genius", "Tactician", "BattleHardened", "NaturalLeader"], "WarCommander", "加里波利奇迹缔造者"),
              p("塔拉特帕夏", "塔拉特", "穆罕默德", "内政大臣", 40, 62, 82, 78, 78, ["Administrator", "IronFist"], "Treasurer", "团结进步委员会核心"),
              p("杰马勒帕夏", "杰马勒", "艾哈迈德", "海军大臣", 42, 76, 76, 74, 76, ["NavalMastery", "Ambitious"], "Admiral", "叙利亚战区与海军大臣"),
          ],
          families: [
              f("奥斯曼", "奥斯曼苏丹皇室", 82, 80, ruling: true),
              f("恩维尔", "青年土耳其军官团", 78, 72),
          ],
          parties: [pt("团结进步委员会", 62), pt("自由协和党", 20), pt("宫廷保守派", 18)],
          power: pw(ind: 0.95, mp: 1.35, mil: 3, eco: 2, sta: 3, nav: 2, fleets: 2, ships: 4, navBonus: 0.10,
                    traits: ["HomelandDefense", "FightToTheEnd"], lifetime: true, term: 40, warSupport: 74)
        ),
        // 3 大英帝国（君主立宪双首脑：乔治五世在位，阿斯奎斯任首相掌政）
        n(3,
          founder: p("乔治五世", "温莎", "乔治", "大英帝国国王", 49, 76, 82, 84, 88, ["Just", "NavalMastery", "Beloved", "Stubborn"], "Ruler", "温莎王朝奠基国王"),
          successors: [
              p("爱德华八世", "温莎", "爱德华", "威尔士亲王", 20, 62, 68, 74, 82, ["Charismatic", "Extravagant"], "Successor", "王储"),
              p("乔治六世", "温莎", "阿尔伯特", "英国国王", 19, 72, 82, 84, 88, ["Brave", "Just", "Beloved"], "Successor", "战时象征国王"),
          ],
          notables: [
              p("赫伯特·阿斯奎斯", "阿斯奎斯", "赫伯特", "大英帝国首相", 61, 68, 86, 86, 82, ["Administrator", "Patient", "Lawgiver"], "Chancellor", "自由党战时首相"),
              p("道格拉斯·黑格", "黑格", "道格拉斯", "英国远征军总司令", 53, 84, 78, 70, 80, ["Stubborn", "Veteran", "BattleHardened"], "WarCommander", "西线远征军元帅"),
              p("约翰·杰利科", "杰利科", "约翰", "大舰队总司令·元帅", 54, 94, 86, 76, 86, ["NavalMastery", "ShipMaster", "Patient", "Strategist"], "Admiral", "一天之内可能输掉战争的人"),
              p("大卫·贝蒂", "贝蒂", "大卫", "战列巡洋舰队司令", 43, 91, 72, 74, 90, ["Brave", "NavalMastery", "Charismatic"], "Admiral", "日德兰先锋海军上将"),
              p("温斯顿·丘吉尔", "丘吉尔", "温斯顿", "海军大臣", 39, 82, 84, 88, 92, ["Visionary", "SeaVision", "Hawkish", "Charismatic"], "Treasurer", "第一海军大臣"),
              p("爱德华·格雷", "格雷", "爱德华", "外交大臣", 52, 54, 82, 90, 80, ["MasterDiplomat", "Patient"], "Diplomat", "英法俄协约推手"),
          ],
          families: [
              f("温莎", "温莎王室", 88, 80, ruling: true),
              f("阿斯奎斯", "自由党执政内阁", 78, 78),
              f("丘吉尔", "马尔伯勒勋贵", 72, 76),
              f("格雷", "英国政治世家", 68, 74),
          ],
          parties: [pt("保守党", 42), pt("自由党", 40), pt("工党", 18)],
          power: pw(ind: 3.40, mp: 1.70, mil: 5, eco: 6, sta: 6, nav: 6, fleets: 6, ships: 10, navBonus: 0.45,
                    traits: ["WellTrained", "StrengthenCore", "HomelandDefense"], lifetime: true, term: 40, warSupport: 84)
        ),
        // 4 法国
        n(4,
          founder: p("雷蒙·普恩加莱", "普恩加莱", "雷蒙", "法兰西共和国总统", 53, 74, 88, 88, 84, ["Just", "Stubborn", "Administrator", "Diplomatic"], "Ruler", "第三共和国总统"),
          successors: [
              p("乔治·克列孟梭", "克列孟梭", "乔治", "总理·法兰西之虎", 62, 82, 90, 86, 92, ["IronFist", "Hawkish", "NaturalLeader", "Stubborn"], "Successor", "法兰西之虎"),
              p("亚历山大·米勒兰", "米勒兰", "亚历山大", "总统", 55, 64, 82, 80, 78, ["Administrator", "Patient"], "Successor", "战后总统"),
          ],
          notables: [
              p("约瑟夫·霞飞", "霞飞", "约瑟夫", "法军总司令·元帅", 62, 88, 80, 72, 86, ["Patient", "Veteran", "BattleHardened"], "WarCommander", "马恩河奇迹总司令"),
              p("费迪南·福煦", "福煦", "费迪南", "协约国联军最高统帅", 62, 93, 82, 82, 90, ["Genius", "Strategist", "Tactician", "NaturalLeader"], "WarCommander", "欧洲联军总元帅"),
              p("菲利普·贝当", "贝当", "菲利普", "凡尔登守将·元帅", 58, 90, 78, 72, 86, ["Patient", "BattleHardened", "Veteran"], "WarCommander", "凡尔登雄狮"),
              p("乔治·克列孟梭", "克列孟梭", "乔治", "参议员·战时总理", 62, 82, 90, 86, 92, ["IronFist", "Hawkish", "NaturalLeader"], "Chancellor", "法兰西之虎"),
          ],
          families: [
              f("普恩加莱", "第三共和国政治世家", 82, 80, ruling: true),
              f("施耐德", "克勒佐军工世家", 72, 76),
          ],
          parties: [pt("激进党", 40), pt("社会党", 32), pt("共和联盟", 28)],
          power: pw(ind: 2.55, mp: 1.45, mil: 5, eco: 5, sta: 5, nav: 5, fleets: 4, ships: 7, navBonus: 0.26,
                    traits: ["HomelandDefense", "FightToTheEnd", "WellTrained"], lifetime: false, term: 5, warSupport: 86)
        ),
        // 5 俄罗斯帝国
        n(5,
          founder: p("尼古拉二世", "罗曼诺夫", "尼古拉", "全俄沙皇", 46, 62, 64, 68, 72, ["Stubborn", "Dovish", "Paranoid"], "Ruler", "末代沙皇"),
          successors: [
              p("亚历山大·克伦斯基", "克伦斯基", "亚历山大", "临时政府总理", 33, 60, 72, 76, 82, ["Charismatic", "Reformer"], "Successor", "二月革命总理"),
              p("弗拉基米尔·列宁", "乌里扬诺夫", "弗拉基米尔", "人民委员会主席", 44, 84, 96, 90, 96, ["Genius", "Visionary", "Reformer", "IronFist", "NaturalLeader"], "Successor", "十月革命领袖"),
          ],
          notables: [
              p("阿列克谢·布鲁西洛夫", "布鲁西洛夫", "阿列克谢", "西南方面军司令", 60, 92, 78, 72, 88, ["Genius", "Tactician", "BattleHardened", "Veteran"], "WarCommander", "布鲁西洛夫攻势名帅"),
              p("尼古拉·尤登尼奇", "尤登尼奇", "尼古拉", "高加索集团军司令", 52, 88, 72, 66, 82, ["Brave", "BattleHardened", "Tactician"], "WarCommander", "高加索战线胜帅"),
              p("亚历山大·高尔察克", "高尔察克", "亚历山大", "黑海舰队司令", 39, 86, 74, 70, 82, ["NavalMastery", "Brave", "ShipMaster"], "Admiral", "沙俄海军名将"),
              p("谢尔盖·萨宗诺夫", "萨宗诺夫", "谢尔盖", "外交大臣", 53, 54, 78, 82, 74, ["Diplomatic", "Patient"], "Diplomat", "俄国外交大臣"),
          ],
          families: [
              f("罗曼诺夫", "罗曼诺夫皇室", 86, 80, ruling: true),
              f("尤苏波夫", "俄罗斯大贵族", 68, 66),
          ],
          parties: [pt("立宪民主党", 32), pt("十月党", 26), pt("社会革命党", 24), pt("布尔什维克", 18)],
          power: pw(ind: 1.15, mp: 2.15, mil: 3, eco: 3, sta: 3, nav: 3, fleets: 3, ships: 5, navBonus: 0.14,
                    traits: ["HomelandDefense", "CoreDefense"], lifetime: true, term: 40, warSupport: 70)
        ),
        // 6 意大利（一战欧洲 20 国细化）
        n(6,
          founder: p("维托里奥·埃马努埃莱三世", "萨伏伊", "维托里奥", "意大利国王", 44, 68, 76, 78, 76, ["Patient", "Stubborn", "Diplomatic"], "Ruler", "萨伏伊君主"),
          successors: [p("翁贝托二世", "萨伏伊", "翁贝托", "王储", 20, 66, 74, 76, 78, ["Diplomatic", "Charismatic"], "Successor", "王太子")],
          notables: [
              p("安东尼奥·萨兰德拉", "萨兰德拉", "安东尼奥", "王国首相", 60, 56, 80, 78, 76, ["Administrator", "Diplomatic"], "Chancellor", "意大利首相"),
              p("阿尔曼多·迪亚兹", "迪亚兹", "阿尔曼多", "陆军元帅", 52, 88, 82, 76, 86, ["Tactician", "Benevolent", "BattleHardened"], "WarCommander", "维托里奥·威尼托胜帅"),
              p("路易吉·卡多尔纳", "卡多尔纳", "路易吉", "总参谋长", 62, 76, 74, 60, 68, ["Stubborn", "IronFist"], "WarCommander", "意军初期总司令"),
          ],
          families: [f("萨伏伊", "萨伏伊王室", 86, 80, ruling: true), f("阿涅利", "都灵工业世家", 70, 74)],
          parties: [pt("自由联盟", 48), pt("意大利社会党", 30), pt("民族主义协会", 22)],
          power: pw(ind: 1.65, mp: 1.35, mil: 4, eco: 4, sta: 4, nav: 4, fleets: 3, ships: 6, navBonus: 0.22,
                    traits: ["CoreDefense", "HomelandDefense"], lifetime: true, term: 40, warSupport: 66)
        ),
        // 7 塞尔维亚王国
        n(7,
          founder: p("彼得一世", "卡拉乔尔杰维奇", "彼得", "塞尔维亚国王", 64, 80, 80, 80, 88, ["Brave", "Just", "Beloved"], "Ruler", "塞尔维亚立宪老国王"),
          successors: [p("亚历山大一世", "卡拉乔尔杰维奇", "亚历山大", "摄政王储", 26, 82, 80, 82, 84, ["Brave", "BattleHardened"], "Successor", "战时摄政王储")],
          notables: [
              p("拉多米尔·普特尼克", "普特尼克", "拉多米尔", "塞尔维亚大元帅", 64, 93, 82, 74, 90, ["Genius", "Strategist", "BattleHardened"], "WarCommander", "塞尔维亚战神元帅"),
              p("尼古拉·帕希奇", "帕希奇", "尼古拉", "王国首相", 64, 62, 86, 88, 82, ["MasterDiplomat", "Stubborn"], "Chancellor", "巴尔干政坛铁腕"),
          ],
          families: [f("卡拉乔尔杰维奇", "塞尔维亚王室", 86, 80, ruling: true), f("普特尼克", "塞尔维亚将门", 76, 82)],
          parties: [pt("人民激进党", 58), pt("独立激进党", 42)],
          power: pw(ind: 0.90, mp: 1.05, mil: 4, eco: 3, sta: 4, nav: 1, fleets: 0, ships: 2, navBonus: 0.0,
                    traits: ["HomelandDefense", "FightToTheEnd", "DefyTheStrong"], lifetime: true, term: 40, warSupport: 94)
        ),
        // 8 比利时王国
        n(8,
          founder: p("阿尔贝一世", "萨克森-科堡", "阿尔贝", "比利时国王", 39, 86, 82, 84, 90, ["Brave", "BattleHardened", "Beloved"], "Ruler", "骑士国王·伊塞尔河守将"),
          successors: [p("利奥波德三世", "萨克森-科堡", "利奥波德", "王储", 18, 72, 78, 76, 78, ["Stubborn", "Patient"], "Successor", "比利时王储")],
          notables: [
              p("热拉尔·莱曼", "莱曼", "热拉尔", "列日要塞司令", 62, 88, 76, 68, 84, ["Stubborn", "Brave", "Veteran"], "WarCommander", "列日死守名将"),
              p("夏尔·德·布罗克维尔", "布罗克维尔", "夏尔", "王国首相", 53, 62, 84, 82, 80, ["Administrator", "Diplomatic"], "Chancellor", "战时首相"),
          ],
          families: [f("萨克森-科堡", "比利时王室", 86, 82, ruling: true), f("索尔维", "布鲁塞尔工业财阀", 74, 78)],
          parties: [pt("天主教党", 48), pt("比利时工党", 30), pt("自由党", 22)],
          power: pw(ind: 1.75, mp: 0.85, mil: 4, eco: 6, sta: 5, nav: 2, fleets: 1, ships: 3, navBonus: 0.08,
                    traits: ["HomelandDefense", "FightToTheEnd", "CoreDefense"], lifetime: true, term: 40, warSupport: 90)
        ),
        // 9 荷兰王国
        n(9,
          founder: p("威廉明娜", "奥兰治-拿骚", "威廉明娜", "荷兰女王", 34, 68, 86, 88, 90, ["Stubborn", "Financier", "Beloved"], "Ruler", "荷兰女王", gender: 1),
          successors: [p("朱丽安娜", "奥兰治-拿骚", "朱丽安娜", "王储", 18, 60, 82, 86, 86, ["Benevolent", "Diplomatic"], "Successor", "荷兰公主", gender: 1)],
          notables: [
              p("科内利斯·斯奈德斯", "斯奈德斯", "科内利斯", "荷军总司令", 62, 82, 80, 74, 78, ["Patient", "Veteran"], "WarCommander", "荷兰武装中立总司令"),
              p("彼得·科特·范·德·林登", "林登", "彼得", "王国首相", 64, 58, 86, 88, 80, ["MasterDiplomat", "Patient"], "Chancellor", "一战中立首相"),
          ],
          families: [f("奥兰治-拿骚", "荷兰王室", 88, 84, ruling: true), f("菲利普", "荷兰工业商贸世家", 74, 78)],
          parties: [pt("自由党", 40), pt("天主教党", 35), pt("社民工党", 25)],
          power: pw(ind: 1.70, mp: 0.80, mil: 4, eco: 6, sta: 5, nav: 4, fleets: 2, ships: 5, navBonus: 0.20,
                    traits: ["CoreDefense", "StrengthenCore"], lifetime: true, term: 40, warSupport: 60)
        ),
        // 10 卢森堡大公国
        n(10,
          founder: p("玛丽-阿德莱德", "拿骚-魏尔堡", "玛丽-阿德莱德", "卢森堡女大公", 20, 52, 76, 80, 82, ["Dovish", "Patient"], "Ruler", "卢森堡女大公", gender: 1),
          successors: [p("夏洛特女大公", "拿骚-魏尔堡", "夏洛特", "女大公", 18, 56, 82, 84, 86, ["Beloved", "Dovish"], "Successor", "王妹", gender: 1)],
          notables: [p("保罗·艾申", "艾申", "保罗", "国务大臣", 64, 52, 84, 86, 78, ["Diplomatic", "Administrator"], "Chancellor", "卢森堡老首相")],
          families: [f("拿骚-魏尔堡", "卢森堡大公家族", 82, 80, ruling: true)],
          parties: [pt("右翼党", 52), pt("自由联盟", 48)],
          power: pw(ind: 0.75, mp: 0.40, mil: 3, eco: 5, sta: 5, nav: 1, fleets: 0, ships: 0, navBonus: 0.0,
                    traits: ["CoreDefense"], lifetime: true, term: 40, warSupport: 50)
        ),
        // 11 瑞士联邦
        n(11,
          founder: p("乌尔里希·维勒", "维勒", "乌尔里希", "联邦总司令", 64, 86, 84, 84, 84, ["Patient", "Veteran", "Strategist"], "Ruler", "武装中立总司令"),
          successors: [p("亨利·吉桑", "吉桑", "亨利", "上将", 40, 88, 86, 86, 88, ["Strategist", "Just"], "Successor", "阿尔卑斯防务名将")],
          notables: [p("阿图尔·霍夫曼", "霍夫曼", "阿图尔", "联邦主席", 57, 56, 88, 88, 80, ["Financier", "MasterDiplomat"], "Chancellor", "瑞士联邦主席")],
          families: [f("维勒", "联邦国防军", 82, 82, ruling: true), f("霍夫曼", "苏黎世银行业世家", 78, 80)],
          parties: [pt("自由民主党", 54), pt("保守人民党", 26), pt("社会民主党", 20)],
          power: pw(ind: 1.75, mp: 0.75, mil: 5, eco: 6, sta: 6, nav: 1, fleets: 0, ships: 0, navBonus: 0.0,
                    traits: ["HomelandDefense", "CoreDefense", "WellTrained"], lifetime: false, term: 4, warSupport: 74)
        ),
        // 12 西班牙王国
        n(12,
          founder: p("阿方索十三世", "波旁", "阿方索", "西班牙国王", 28, 66, 74, 80, 80, ["Diplomatic", "Dovish", "Charismatic"], "Ruler", "中立国王"),
          successors: [p("胡安·德·波旁", "波旁", "胡安", "巴塞罗那伯爵", 22, 66, 74, 78, 76, ["Patient", "Diplomatic"], "Successor", "王位继承人")],
          notables: [
              p("爱德华多·达托", "达托", "爱德华多", "首相", 57, 56, 84, 86, 80, ["Dovish", "Administrator", "Diplomatic"], "Chancellor", "坚持中立首相"),
              p("米格尔·普里莫·德·里维拉", "里维拉", "米格尔", "上将", 44, 80, 76, 70, 78, ["IronFist", "Veteran"], "WarCommander", "西班牙军界强人"),
          ],
          families: [f("波旁", "西班牙波旁王室", 84, 80, ruling: true), f("阿尔巴", "西班牙贵族院", 66, 72)],
          parties: [pt("保守党", 44), pt("自由党", 36), pt("西班牙工人社会党", 20)],
          power: pw(ind: 1.25, mp: 1.05, mil: 3, eco: 4, sta: 4, nav: 3, fleets: 2, ships: 4, navBonus: 0.14,
                    traits: ["CoreDefense", "HomelandDefense"], lifetime: true, term: 40, warSupport: 52)
        ),
        // 13 葡萄牙共和国
        n(13,
          founder: p("曼努埃尔·德·阿里亚加", "阿里亚加", "曼努埃尔", "共和国总统", 64, 60, 76, 80, 78, ["Scholar", "Diplomatic"], "Ruler", "第一共和国首任总统"),
          successors: [p("贝尔纳迪诺·马沙多", "马沙多", "贝尔纳迪诺", "总统", 63, 62, 78, 82, 78, ["Diplomatic", "Patient"], "Successor", "协约派总统")],
          notables: [p("费尔南多·塔马尼尼", "塔马尼尼", "费尔南多", "远征军司令", 58, 82, 76, 72, 78, ["Veteran", "Brave"], "WarCommander", "葡萄牙远征军统帅")],
          families: [f("阿里亚加", "里斯本共和派", 76, 80, ruling: true)],
          parties: [pt("民主党", 56), pt("进化党", 24), pt("联合党", 20)],
          power: pw(ind: 0.90, mp: 0.75, mil: 3, eco: 3, sta: 4, nav: 3, fleets: 2, ships: 4, navBonus: 0.14,
                    traits: ["CoreDefense"], lifetime: false, term: 4, warSupport: 60)
        ),
        // 14 瑞典王国
        n(14,
          founder: p("古斯塔夫五世", "贝尔纳多特", "古斯塔夫", "瑞典国王", 56, 62, 82, 86, 82, ["Dovish", "Patient"], "Ruler", "瑞典国王"),
          successors: [p("古斯塔夫六世", "贝尔纳多特", "古斯塔夫·阿道夫", "王储", 32, 62, 84, 84, 84, ["Scholar", "Just"], "Successor", "瑞典王储")],
          notables: [p("亚尔马·哈马舍尔德", "哈马舍尔德", "亚尔马", "瑞典首相", 52, 60, 86, 86, 78, ["Lawgiver", "Patient"], "Chancellor", "中立首相")],
          families: [f("贝尔纳多特", "瑞典王室", 84, 82, ruling: true), f("瓦伦堡", "斯德哥尔摩金融世家", 78, 80)],
          parties: [pt("社会民主党", 42), pt("保守党", 34), pt("自由党", 24)],
          power: pw(ind: 1.70, mp: 0.85, mil: 4, eco: 5, sta: 5, nav: 3, fleets: 2, ships: 5, navBonus: 0.16,
                    traits: ["WellTrained", "CoreDefense"], lifetime: true, term: 40, warSupport: 58)
        ),
        // 15 挪威王国
        n(15,
          founder: p("哈康七世", "格吕克斯堡", "哈康", "挪威国王", 42, 70, 80, 86, 90, ["Just", "Brave", "Beloved"], "Ruler", "挪威国王"),
          successors: [p("奥拉夫五世", "格吕克斯堡", "奥拉夫", "王储", 18, 72, 80, 84, 88, ["Brave", "Beloved"], "Successor", "挪威王储")],
          notables: [p("贡纳尔·克努森", "克努森", "贡纳尔", "挪威首相", 64, 58, 84, 84, 80, ["Financier", "Patient"], "Chancellor", "中立商船首相")],
          families: [f("格吕克斯堡", "挪威王室", 86, 82, ruling: true)],
          parties: [pt("自由党", 50), pt("工党", 30), pt("保守党", 20)],
          power: pw(ind: 1.25, mp: 0.70, mil: 3, eco: 5, sta: 5, nav: 4, fleets: 2, ships: 5, navBonus: 0.18,
                    traits: ["HomelandDefense"], lifetime: true, term: 40, warSupport: 60)
        ),
        // 16 丹麦王国
        n(16,
          founder: p("克里斯蒂安十世", "格吕克斯堡", "克里斯蒂安", "丹麦国王", 44, 66, 80, 82, 86, ["Just", "Beloved"], "Ruler", "丹麦国王"),
          successors: [p("腓特烈九世", "格吕克斯堡", "腓特烈", "王储", 18, 66, 80, 82, 84, ["NavalMastery", "Beloved"], "Successor", "丹麦王储")],
          notables: [p("卡尔·特奥多尔·扎勒", "扎勒", "卡尔", "丹麦首相", 48, 56, 84, 86, 78, ["Dovish", "Diplomatic"], "Chancellor", "丹麦中立首相")],
          families: [f("格吕克斯堡", "丹麦王室", 84, 82, ruling: true)],
          parties: [pt("激进自由党", 42), pt("社会民主党", 36), pt("保守党", 22)],
          power: pw(ind: 1.25, mp: 0.65, mil: 3, eco: 5, sta: 5, nav: 3, fleets: 2, ships: 4, navBonus: 0.14,
                    traits: ["CoreDefense"], lifetime: true, term: 40, warSupport: 58)
        ),
        // 17 罗马尼亚王国
        n(17,
          founder: p("卡罗尔一世", "霍亨索伦-锡格马林根", "卡罗尔", "罗马尼亚国王", 64, 76, 82, 80, 80, ["Veteran", "Patient"], "Ruler", "罗马尼亚开国君主"),
          successors: [p("斐迪南一世", "霍亨索伦-锡格马林根", "斐迪南", "国王", 49, 72, 80, 82, 82, ["Unifier", "Just"], "Successor", "大罗马尼亚君主")],
          notables: [
              p("扬·布勒蒂亚努", "布勒蒂亚努", "扬", "王国首相", 50, 62, 86, 88, 82, ["MasterDiplomat", "Administrator"], "Chancellor", "罗马尼亚大首相"),
              p("亚历山德鲁·阿韦雷斯库", "阿韦雷斯库", "亚历山德鲁", "陆军元帅", 55, 88, 76, 70, 84, ["Tactician", "BattleHardened"], "WarCommander", "默勒什蒂胜帅"),
          ],
          families: [f("霍亨索伦-锡格马林根", "罗马尼亚王室", 84, 80, ruling: true), f("布勒蒂亚努", "国家自由党世家", 76, 78)],
          parties: [pt("国家自由党", 58), pt("保守党", 42)],
          power: pw(ind: 1.25, mp: 1.05, mil: 4, eco: 4, sta: 4, nav: 2, fleets: 1, ships: 3, navBonus: 0.08,
                    traits: ["HomelandDefense"], lifetime: true, term: 40, warSupport: 72)
        ),
        // 18 保加利亚王国
        n(18,
          founder: p("斐迪南一世", "萨克森-科堡", "斐迪南", "保加利亚沙皇", 53, 74, 78, 80, 76, ["Ambitious", "Hawkish"], "Ruler", "巴尔干之狐"),
          successors: [p("鲍里斯三世", "萨克森-科堡", "鲍里斯", "王储", 20, 74, 80, 84, 84, ["Diplomatic", "Patient"], "Successor", "王储")],
          notables: [p("尼古拉·热科夫", "热科夫", "尼古拉", "陆军总司令", 50, 86, 76, 70, 82, ["BattleHardened", "Tactician"], "WarCommander", "巴尔干虎将")],
          families: [f("萨克森-科堡", "保加利亚王室", 84, 80, ruling: true)],
          parties: [pt("自由联盟", 54), pt("农民联盟", 46)],
          power: pw(ind: 1.05, mp: 1.00, mil: 4, eco: 3, sta: 4, nav: 2, fleets: 1, ships: 3, navBonus: 0.06,
                    traits: ["FieldCombatElite", "WellTrained"], lifetime: true, term: 40, warSupport: 80)
        ),
        // 19 希腊王国
        n(19,
          founder: p("康斯坦丁一世", "格吕克斯堡", "康斯坦丁", "希腊国王", 46, 80, 74, 74, 80, ["Veteran", "Stubborn"], "Ruler", "巴尔干战争统帅"),
          successors: [p("乔治二世", "格吕克斯堡", "乔治", "王储", 24, 68, 76, 80, 78, ["Patient", "Diplomatic"], "Successor", "希腊王储")],
          notables: [
              p("埃莱夫塞里奥斯·韦尼泽洛斯", "韦尼泽洛斯", "埃莱夫塞里奥斯", "王国首相", 50, 72, 90, 92, 90, ["MasterDiplomat", "Visionary", "Reformer"], "Chancellor", "现代希腊缔造者"),
              p("帕夫洛斯·孔图里奥蒂斯", "孔图里奥蒂斯", "帕夫洛斯", "海军上将", 59, 88, 78, 76, 86, ["NavalMastery", "Brave"], "Admiral", "爱琴海战神"),
          ],
          families: [f("格吕克斯堡", "希腊王室", 82, 80, ruling: true), f("韦尼泽洛斯", "自由党革新派", 78, 56)],
          parties: [pt("希腊自由党", 58), pt("王室保守派", 42)],
          power: pw(ind: 1.05, mp: 0.90, mil: 4, eco: 4, sta: 4, nav: 4, fleets: 2, ships: 5, navBonus: 0.20,
                    traits: ["HomelandDefense", "CoreDefense"], lifetime: true, term: 40, warSupport: 74),
          familyRelations: [fr("格吕克斯堡", "韦尼泽洛斯", -34)]
        ),
    ]

    // MARK: - 剧本 8：民国危局 · 九一八事变（公元 1931 年 9 月 · 中国全图 · 11 势力）

    private static let china1931: [HistoricalNationRoster] = [
        // 0 南京国民政府
        n(0,
          founder: p("蒋中正", "蒋", "中正", "国民政府主席", 44, 82, 84, 86, 86, ["Stubborn", "IronFist", "Diplomatic"], "Ruler", "南京国民政府主席"),
          successors: [
              p("林森", "林", "森", "国民政府主席", 63, 56, 82, 84, 84, ["Benevolent", "Patient"], "Successor", "国府元老"),
              p("李宗仁", "李", "宗仁", "一级上将", 40, 91, 82, 82, 88, ["Tactician", "BattleHardened"], "Successor", "桂系名将"),
          ],
          notables: [
              p("何应钦", "何", "应钦", "军政部长", 41, 82, 84, 78, 78, ["Administrator", "Veteran"], "Chancellor", "中央军总长"),
              p("蔡廷锴", "蔡", "廷锴", "第十九路军军长", 39, 90, 76, 74, 88, ["Brave", "BattleHardened", "Tactician"], "WarCommander", "一二八淞沪抗战名将"),
              p("薛岳", "薛", "岳", "陆军中将", 35, 93, 76, 72, 88, ["Brave", "Tactician", "BattleHardened"], "WarCommander", "华南猛将"),
              p("张治中", "张", "治中", "第五军军长", 41, 86, 82, 82, 84, ["Diplomatic", "Veteran"], "WarCommander", "淞沪抗战主力将领"),
              p("陈绍宽", "陈", "绍宽", "海军部长·上将", 42, 82, 80, 76, 80, ["NavalMastery", "Patient"], "Admiral", "民国海军总长"),
          ],
          families: [f("蒋", "黄埔中央系", 88, 84, ruling: true), f("宋", "江浙财政系", 76, 80), f("陈", "CC系政学系", 72, 76)],
          parties: [pt("中国国民党中央派", 74), pt("国民党改组派", 26)],
          power: pw(ind: 0.72, mp: 1.90, mil: 3, eco: 3, sta: 3, nav: 2, fleets: 1, ships: 3, navBonus: 0.04,
                    traits: ["CoreDefense", "HomelandDefense"], lifetime: true, term: 40, warSupport: 70)
        ),
        // 1 东北边防军（张学良）
        n(1,
          founder: p("张学良", "张", "学良", "东北边防军司令长官", 30, 78, 76, 80, 86, ["Charismatic", "Brave", "Patient"], "Ruler", "少帅·陆海空军副总司令"),
          successors: [p("杨虎城", "杨", "虎城", "第十七路军总指挥", 38, 84, 78, 76, 84, ["Brave", "Stubborn"], "Successor", "西北军名将")],
          notables: [
              p("马占山", "马", "占山", "黑龙江省代主席", 46, 89, 74, 72, 88, ["Brave", "BattleHardened", "DefyTheStrong"], "WarCommander", "江桥抗战第一枪英雄"),
              p("王以哲", "王", "以哲", "东北军第七旅旅长", 35, 86, 76, 74, 82, ["Tactician", "Brave"], "WarCommander", "北大营抗战名将"),
              p("沈鸿烈", "沈", "鸿烈", "东北海军总司令", 49, 82, 80, 76, 80, ["NavalMastery", "Administrator"], "Admiral", "东北海军缔造者"),
          ],
          families: [f("张", "奉系帅府", 88, 84, ruling: true), f("于", "东北军老帅将门", 74, 78)],
          parties: [pt("奉系东北军", 78), pt("东北抗日义勇军派", 22)],
          power: pw(ind: 0.88, mp: 1.35, mil: 3, eco: 3, sta: 3, nav: 2, fleets: 1, ships: 4, navBonus: 0.06,
                    traits: ["HomelandDefense", "CoreDefense"], lifetime: true, term: 40, warSupport: 82)
        ),
        // 2 中华苏维埃（瑞金红军）
        n(2,
          founder: p("毛泽东", "毛", "泽东", "中华苏维埃主席", 38, 96, 94, 90, 96, ["Genius", "Strategist", "Visionary", "Beloved"], "Ruler", "中央苏区领袖"),
          successors: [p("周恩来", "周", "恩来", "军委副主席", 33, 84, 96, 98, 96, ["Genius", "MasterDiplomat", "Administrator"], "Successor", "红军总政委")],
          notables: [
              p("朱德", "朱", "德", "中国工农红军总司令", 45, 95, 84, 80, 94, ["Veteran", "BattleHardened", "NaturalLeader"], "WarCommander", "红军之父"),
              p("彭德怀", "彭", "德怀", "红三军团军团长", 33, 96, 80, 72, 90, ["Brave", "BattleHardened", "IronFist"], "WarCommander", "横刀立马彭大将军"),
              p("林彪", "林", "彪", "红一军团军团长", 24, 96, 76, 68, 84, ["Genius", "Tactician", "Strategist"], "WarCommander", "反围剿奇袭名将"),
              p("粟裕", "粟", "裕", "红四军参谋长", 24, 95, 80, 72, 86, ["Genius", "Tactician"], "WarCommander", "机动战天才"),
          ],
          families: [f("毛", "中央苏区执委会", 92, 88, ruling: true), f("朱", "红一方面军总部", 84, 90)],
          parties: [pt("中国共产党", 100)],
          power: pw(ind: 0.30, mp: 1.25, mil: 2, eco: 2, sta: 5, nav: 1, fleets: 0, ships: 0, navBonus: 0.0,
                    traits: ["HomelandDefense", "FightToTheEnd"], lifetime: true, term: 40, warSupport: 96)
        ),
        // 3 大日本帝国·关东军（1931 昭和天皇裕仁 + 若槻礼次郎首相 + 本庄繁关东军司令）
        n(3,
          founder: p("裕仁", "", "裕仁", "天皇", 30, 74, 78, 74, 82, ["Stubborn", "Patient", "NaturalLeader"], "Ruler", "昭和天皇（日本皇室无姓氏）"),
          successors: [p("明仁", "", "明仁", "皇太子", 18, 58, 80, 86, 84, ["Benevolent", "Dovish"], "Successor", "皇太子")],
          notables: [
              p("本庄繁", "本庄", "繁", "关东军司令官", 55, 86, 78, 66, 80, ["Hawkish", "IronFist", "Veteran"], "Chancellor", "九一八关东军司令"),
              p("石原莞尔", "石原", "莞尔", "关东军作战主任参谋", 42, 90, 82, 68, 80, ["Strategist", "Ambitious", "Tactician"], "WarCommander", "柳条湖事件策划者"),
              p("板垣征四郎", "板垣", "征四郎", "关东军高级参谋", 46, 86, 76, 66, 78, ["Hawkish", "BattleHardened"], "WarCommander", "关东军激进派主将"),
              p("山本五十六", "山本", "五十六", "海军航空本部技术部长", 47, 96, 86, 82, 92, ["Genius", "NavalMastery", "ShipMaster"], "Admiral", "帝国海军航空先驱"),
          ],
          families: [
              f("", "日本皇室", 94, 88, ruling: true),
              f("本庄", "关东军少壮派", 86, 60),
              f("山本", "帝国海军舰队派", 82, 74),
              f("三井", "满铁与财阀团", 78, 76),
          ],
          parties: [pt("立宪民政党", 48), pt("立宪政友会", 32), pt("军部统制派", 20)],
          power: pw(ind: 3.30, mp: 1.45, mil: 6, eco: 6, sta: 5, nav: 6, fleets: 5, ships: 10, navBonus: 0.50,
                    traits: ["FieldCombatElite", "WellTrained", "Conqueror", "SiegeCapture"], lifetime: true, term: 40, warSupport: 88),
          familyRelations: [fr("本庄", "山本", -42)],
          fixedEraName: "昭和"
        ),
        // 4 晋绥军政府
        n(4,
          founder: p("阎锡山", "阎", "锡山", "太原绥靖公署主任", 48, 80, 88, 84, 80, ["Financier", "Administrator", "Patient"], "Ruler", "山西王·晋绥领袖"),
          successors: [p("傅作义", "傅", "作义", "第三十五军军长", 36, 92, 82, 78, 88, ["Tactician", "BattleHardened", "Brave"], "Successor", "绥远抗战英雄")],
          notables: [
              p("傅作义", "傅", "作义", "第三十五军军长", 36, 92, 82, 78, 88, ["Tactician", "BattleHardened", "Brave"], "WarCommander", "百灵庙大捷名将"),
              p("徐永昌", "徐", "永昌", "山西省主席", 44, 82, 84, 80, 82, ["Patient", "Administrator"], "Chancellor", "晋绥重臣"),
          ],
          families: [f("阎", "晋绥实业军政系", 88, 84, ruling: true), f("傅", "绥远守边将门", 76, 80)],
          parties: [pt("晋绥军政系", 100)],
          power: pw(ind: 0.78, mp: 1.05, mil: 3, eco: 4, sta: 4, nav: 1, fleets: 0, ships: 0, navBonus: 0.0,
                    traits: ["CoreDefense", "HomelandDefense"], lifetime: true, term: 40, warSupport: 78)
        ),
        // 5 新桂系
        n(5,
          founder: p("李宗仁", "李", "宗仁", "第四集团军总司令", 40, 91, 82, 82, 88, ["Tactician", "BattleHardened", "NaturalLeader"], "Ruler", "新桂系领袖"),
          successors: [p("白崇禧", "白", "崇禧", "副总司令", 38, 94, 84, 82, 86, ["Genius", "Strategist", "Tactician"], "Successor", "小诸葛")],
          notables: [p("白崇禧", "白", "崇禧", "第四集团军副总司令", 38, 94, 84, 82, 86, ["Genius", "Strategist", "Tactician"], "WarCommander", "桂军大脑")],
          families: [f("李", "新桂系军团", 88, 86, ruling: true), f("白", "桂系参谋将门", 84, 90)],
          parties: [pt("新桂系", 100)],
          power: pw(ind: 0.62, mp: 1.15, mil: 4, eco: 3, sta: 4, nav: 1, fleets: 0, ships: 0, navBonus: 0.0,
                    traits: ["FieldCombatElite", "FightToTheEnd"], lifetime: true, term: 40, warSupport: 86)
        ),
        // 6 川军与西南
        n(6,
          founder: p("刘湘", "刘", "湘", "川军总司令", 43, 84, 80, 76, 84, ["BattleHardened", "Brave", "Veteran"], "Ruler", "四川王·出川抗日名将"),
          successors: [p("龙云", "龙", "云", "云南省主席", 47, 82, 80, 78, 82, ["Patient", "Veteran"], "Successor", "云南王")],
          notables: [
              p("王铭章", "王", "铭章", "川军师长", 38, 90, 74, 70, 88, ["Brave", "BattleHardened", "Stubborn"], "WarCommander", "滕县血战忠魂"),
              p("龙云", "龙", "云", "滇军总司令", 47, 82, 80, 78, 82, ["Veteran", "Administrator"], "Chancellor", "云南主政者"),
          ],
          families: [f("刘", "川军速成系", 84, 82, ruling: true), f("龙", "滇军将门", 76, 76)],
          parties: [pt("川军各防区", 68), pt("滇军系", 32)],
          power: pw(ind: 0.60, mp: 1.55, mil: 2, eco: 3, sta: 3, nav: 1, fleets: 0, ships: 0, navBonus: 0.0,
                    traits: ["HomelandDefense", "FightToTheEnd"], lifetime: true, term: 40, warSupport: 84)
        ),
        // 7 西北马家军
        n(7,
          founder: p("马鸿逵", "马", "鸿逵", "宁夏省主席", 39, 80, 74, 72, 78, ["IronFist", "BattleHardened"], "Ruler", "宁夏马家军首领"),
          successors: [p("马步芳", "马", "步芳", "青海省主席", 28, 82, 70, 68, 76, ["Hawkish", "IronFist"], "Successor", "青马骑兵统领")],
          notables: [p("马步芳", "马", "步芳", "骑兵旅长", 28, 82, 70, 68, 76, ["BattleHardened", "Brave"], "WarCommander", "西北骑兵主将")],
          families: [f("马", "西北马氏将门", 88, 84, ruling: true)],
          parties: [pt("西北马家军", 100)],
          power: pw(ind: 0.45, mp: 0.95, mil: 3, eco: 2, sta: 3, nav: 1, fleets: 0, ships: 0, navBonus: 0.0,
                    traits: ["CavalryTradition", "HomelandDefense"], lifetime: true, term: 40, warSupport: 78)
        ),
        // 8 新疆省政府
        n(8,
          founder: p("盛世才", "盛", "世才", "新疆边防督办", 36, 80, 78, 76, 74, ["Ambitious", "IronFist"], "Ruler", "新疆督办"),
          successors: [p("金树仁", "金", "树仁", "省主席", 52, 64, 68, 68, 66, ["Stubborn", "Paranoid"], "Successor", "前省主席")],
          notables: [p("张培元", "张", "培元", "伊犁屯垦使", 37, 80, 72, 70, 76, ["Brave", "Veteran"], "WarCommander", "伊犁守将")],
          families: [f("盛", "迪化督办署", 82, 80, ruling: true)],
          parties: [pt("新疆边防督办署", 100)],
          power: pw(ind: 0.42, mp: 0.75, mil: 2, eco: 2, sta: 3, nav: 1, fleets: 0, ships: 0, navBonus: 0.0,
                    traits: ["HomelandDefense"], lifetime: true, term: 40, warSupport: 68)
        ),
        // 9 苏联远东
        n(9,
          founder: p("瓦西里·布柳赫尔", "布柳赫尔", "瓦西里", "远东特别集团军元帅", 41, 93, 82, 76, 90, ["Strategist", "BattleHardened", "NaturalLeader"], "Ruler", "苏联元帅·远东统帅"),
          successors: [p("格奥尔基·朱可夫", "朱可夫", "格奥尔基", "苏联元帅", 35, 97, 84, 74, 92, ["Genius", "BattleHardened", "Strategist"], "Successor", "诺门罕胜帅")],
          notables: [p("格奥尔基·朱可夫", "朱可夫", "格奥尔基", "装甲军军长", 35, 97, 84, 74, 92, ["Genius", "BattleHardened", "Strategist"], "WarCommander", "未来胜利元帅")],
          families: [f("布柳赫尔", "远东红旗集团军", 88, 82, ruling: true)],
          parties: [pt("苏联共产党", 100)],
          power: pw(ind: 1.65, mp: 1.40, mil: 5, eco: 4, sta: 5, nav: 3, fleets: 2, ships: 5, navBonus: 0.16,
                    traits: ["HomelandDefense", "WellTrained"], lifetime: true, term: 40, warSupport: 84)
        ),
        // 10 外蒙古
        n(10,
          founder: p("霍尔洛·乔巴山", "乔巴山", "霍尔洛", "蒙古元帅", 36, 84, 78, 76, 82, ["IronFist", "Veteran"], "Ruler", "蒙古人民军元帅"),
          successors: [p("尤睦佳·泽登巴尔", "泽登巴尔", "尤睦佳", "总书记", 20, 66, 80, 78, 76, ["Administrator", "Patient"], "Successor", "接班人")],
          notables: [p("格勒格道尔吉·德米德", "德米德", "格勒格道尔吉", "骑兵元帅", 31, 86, 74, 70, 82, ["Brave", "BattleHardened"], "WarCommander", "草原骑兵名将")],
          families: [f("乔巴山", "蒙古人民革命党", 84, 82, ruling: true)],
          parties: [pt("蒙古人民革命党", 100)],
          power: pw(ind: 0.45, mp: 0.70, mil: 3, eco: 2, sta: 3, nav: 1, fleets: 0, ships: 0, navBonus: 0.0,
                    traits: ["CavalryTradition", "HomelandDefense"], lifetime: true, term: 40, warSupport: 78, startArmies: 2, maxArmies: 5)
        ),
        // 11 西藏地方
        n(11,
          founder: p("土登嘉措", "格鲁", "土登嘉措", "十三世达赖", 55, 62, 82, 82, 88, ["Patient", "Just", "Scholar"], "Ruler", "十三世达赖"),
          successors: [p("热振活佛", "格鲁", "降白益西", "摄政活佛", 20, 58, 76, 78, 82, ["Patient", "Scholar"], "Successor", "摄政")],
          notables: [p("察绒·达桑占堆", "察绒", "达桑占堆", "藏军总司令", 43, 80, 78, 74, 80, ["Reformer", "Veteran"], "WarCommander", "藏军近代化统领")],
          families: [f("格鲁", "噶厦政府", 86, 82, ruling: true), f("察绒", "藏军贵族派", 72, 74)],
          parties: [pt("噶厦执政派", 68), pt("寺院僧官派", 32)],
          power: pw(ind: 0.35, mp: 0.60, mil: 2, eco: 2, sta: 3, nav: 1, fleets: 0, ships: 0, navBonus: 0.0,
                    traits: ["HomelandDefense", "CoreDefense"], lifetime: true, term: 40, warSupport: 62, startArmies: 2, maxArmies: 5)
        ),
        // 12 滇军龙云
        n(12,
          founder: p("龙云", "龙", "云", "云南省主席", 47, 84, 82, 80, 86, ["BattleHardened", "Veteran", "Stubborn"], "Ruler", "云南王·滇军总司令"),
          successors: [p("卢汉", "卢", "汉", "第六十军军长", 36, 88, 80, 78, 86, ["Brave", "BattleHardened", "Tactician"], "Successor", "台儿庄血战名将")],
          notables: [p("卢汉", "卢", "汉", "滇军主力军长", 36, 88, 80, 78, 86, ["Brave", "BattleHardened", "Tactician"], "WarCommander", "滇军悍将")],
          families: [f("龙", "昆明滇军帅府", 88, 84, ruling: true), f("卢", "滇军将门", 78, 84)],
          parties: [pt("滇军系", 100)],
          power: pw(ind: 0.55, mp: 0.95, mil: 3, eco: 3, sta: 3, nav: 1, fleets: 0, ships: 0, navBonus: 0.0,
                    traits: ["HomelandDefense", "FightToTheEnd"], lifetime: true, term: 40, warSupport: 82, startArmies: 3, maxArmies: 7)
        ),
        // 13 英属印度与缅甸
        n(13,
          founder: p("威灵顿勋爵", "弗里曼-托马斯", "乔治", "印度总督", 62, 76, 86, 84, 80, ["Administrator", "Financier", "Patient"], "Ruler", "英属印度总督"),
          successors: [p("林利思戈勋爵", "霍普", "维克托", "印度总督", 44, 72, 84, 82, 78, ["Administrator", "Stubborn"], "Successor", "继任总督")],
          notables: [p("菲利普·切特伍德", "切特伍德", "菲利普", "英印军总司令·元帅", 62, 86, 80, 74, 82, ["Veteran", "Strategist"], "WarCommander", "英印陆军元帅")],
          families: [f("温莎", "新德里总督府", 86, 82, ruling: true)],
          parties: [pt("印度总督府", 66), pt("印度国大党", 34)],
          power: pw(ind: 1.35, mp: 1.45, mil: 4, eco: 4, sta: 4, nav: 5, fleets: 3, ships: 6, navBonus: 0.28,
                    traits: ["WellTrained", "CoreDefense"], lifetime: true, term: 40, warSupport: 64, startArmies: 5, maxArmies: 10)
        ),
        // 14 法属印度支那
        n(14,
          founder: p("皮埃尔·帕斯基耶", "帕斯基耶", "皮埃尔", "印支总督", 54, 66, 78, 76, 72, ["Administrator", "Patient"], "Ruler", "河内印支总督"),
          successors: [p("勒内·罗班", "罗班", "勒内", "印支总督", 58, 66, 76, 74, 70, ["Administrator", "IronFist"], "Successor", "继任总督")],
          notables: [p("夏尔·欧班", "欧班", "夏尔", "印支驻军司令", 56, 76, 74, 70, 72, ["Veteran"], "WarCommander", "河内防卫司令")],
          families: [f("帕斯基耶", "河内总督府", 80, 80, ruling: true)],
          parties: [pt("河内殖民总督府", 70), pt("越南民族独立派", 30)],
          power: pw(ind: 0.85, mp: 0.90, mil: 3, eco: 3, sta: 3, nav: 3, fleets: 1, ships: 4, navBonus: 0.12,
                    traits: ["CoreDefense"], lifetime: true, term: 40, warSupport: 54, startArmies: 3, maxArmies: 6)
        ),
    ]

    // MARK: - 剧本 9：二战前夜 · 欧陆风云（公元 1936 年 · 28 国完整还原奥地利/捷克斯洛伐克/低地三国）

    private static let ww2Eve1936: [HistoricalNationRoster] = {
        // 复用 1939 欧洲 27 国高精名录基座，精准替换为 1936 真实领袖、1936 和平开局兵力并加入独立奥地利(23)与捷克斯洛伐克(24)
        var list = ww2Europe1939.map { item -> HistoricalNationRoster in
            var copy = item
            if item.nationIndex >= 24 { copy.nationIndex = item.nationIndex + 1 }
            // 1936 年欧洲尚未全面总动员，按和平/扩军初期适当压低开局现役兵力
            if let st = copy.power.startingArmies {
                copy.power.startingArmies = max(1, Int((Double(st) * 0.74).rounded()))
            }
            return copy
        }
        // 0 德国 1936 莱茵兰扩军初期：11 支精锐师，战时上限 28
        if let idx = list.firstIndex(where: { $0.nationIndex == 0 }) {
            list[idx].power.startingArmies = 11
            list[idx].power.maxArmies = 28
        }
        // 1 苏联 1936：12 支常备军（战时动员上限 30）
        if let idx = list.firstIndex(where: { $0.nationIndex == 1 }) {
            list[idx].power.startingArmies = 12
            list[idx].power.maxArmies = 30
        }
        // 替换 3 法国 1936 人民阵线总理莱昂·布鲁姆
        if let idx = list.firstIndex(where: { $0.nationIndex == 3 }) {
            list[idx].founder = p("莱昂·布鲁姆", "布鲁姆", "莱昂", "法兰西总理", 64, 64, 80, 82, 80, ["Reformer", "Scholar", "Diplomatic"], "Ruler", "人民阵线总理")
            list[idx].power.startingArmies = 10
        }
        // 替换 6 西班牙第二共和国总统阿萨尼亚
        if let idx = list.firstIndex(where: { $0.nationIndex == 6 }) {
            list[idx].founder = p("曼努埃尔·阿萨尼亚", "阿萨尼亚", "曼努埃尔", "西班牙共和国总统", 56, 66, 80, 80, 82, ["Scholar", "Reformer", "Patient"], "Ruler", "第二共和国总统")
        }
        // 替换 15 土耳其国父凯末尔（1936 在世）
        if let idx = list.firstIndex(where: { $0.nationIndex == 15 }) {
            list[idx].founder = p("穆斯塔法·凯末尔", "阿塔图尔克", "穆斯塔法·凯末尔", "土耳其国父·总统", 55, 95, 94, 92, 96, ["Genius", "Reformer", "Unifier", "Visionary"], "Ruler", "土耳其国父")
        }
        // 替换 23 为独立奥地利联邦国
        list.removeAll { $0.nationIndex == 23 }
        list.append(n(23,
          founder: p("库尔特·许士尼格", "许士尼格", "库尔特", "奥地利联邦总理", 38, 66, 80, 78, 76, ["Patient", "Dovish", "Administrator"], "Ruler", "奥地利末任独立总理"),
          successors: [p("威廉·米克拉斯", "米克拉斯", "威廉", "联邦总统", 64, 58, 78, 80, 76, ["Patient", "Just"], "Successor", "奥地利总统")],
          notables: [p("阿尔弗雷德·扬萨", "扬萨", "阿尔弗雷德", "总参谋长", 52, 84, 78, 72, 78, ["Strategist", "Veteran"], "WarCommander", "奥地利国防军参谋长")],
          families: [f("许士尼格", "维也纳祖国阵线", 80, 80, ruling: true), f("哈布斯堡", "奥地利旧皇室", 68, 70)],
          parties: [pt("祖国阵线", 72), pt("社会民主党", 28)],
          power: pw(ind: 1.30, mp: 0.78, mil: 4, eco: 5, sta: 5, nav: 1, fleets: 0, ships: 0, navBonus: 0.0,
                    traits: ["CoreDefense", "HomelandDefense"], lifetime: false, term: 4, warSupport: 64, startArmies: 3, maxArmies: 6)
        ))
        // 插入 24 捷克斯洛伐克（军工强国斯柯达+苏台德堡垒）
        list.append(n(24,
          founder: p("爱德华·贝奈斯", "贝奈斯", "爱德华", "捷克斯洛伐克总统", 52, 74, 88, 88, 84, ["MasterDiplomat", "Administrator", "Scholar"], "Ruler", "捷克斯洛伐克总统"),
          successors: [p("扬·西罗维", "西罗维", "扬", "陆军上将·总理", 48, 86, 80, 74, 84, ["BattleHardened", "Brave"], "Successor", "独眼战神总理")],
          notables: [
              p("扬·西罗维", "西罗维", "扬", "总督察·上将", 48, 86, 80, 74, 84, ["BattleHardened", "Brave", "Veteran"], "WarCommander", "捷克陆军名将"),
              p("卢德维克·克雷伊奇", "克雷伊奇", "卢德维克", "总参谋长", 46, 88, 82, 72, 80, ["Strategist", "Tactician"], "WarCommander", "苏台德防线设计师"),
          ],
          families: [f("贝奈斯", "布拉格共和派", 84, 82, ruling: true), f("斯柯达", "比尔森重工军工集团", 80, 82)],
          parties: [pt("农业党", 36), pt("国家社会党", 34), pt("社会民主党", 30)],
          power: pw(ind: 2.15, mp: 1.05, mil: 5, eco: 6, sta: 5, nav: 1, fleets: 0, ships: 0, navBonus: 0.0,
                    traits: ["WellTrained", "CoreDefense", "HomelandDefense"], lifetime: false, term: 7, warSupport: 86, startArmies: 6, maxArmies: 11)
        ))
        return list.sorted { $0.nationIndex < $1.nationIndex }
    }()

    // MARK: - 剧本 8：第二次世界大战 · 欧洲风暴（公元 1939 年，16 国）

    private static let ww2Europe1939: [HistoricalNationRoster] = [
        // 0 德意志第三帝国
        n(0,
          founder: p("阿道夫·希特勒", "希特勒", "阿道夫", "元首兼帝国总理", 50, 86, 84, 75, 94, ["Ambitious", "Hawkish", "Charismatic", "IronFist", "Conqueror"], "Ruler", "第三帝国元首"),
          successors: [
              p("卡尔·邓尼茨", "邓尼茨", "卡尔", "海军元帅·帝国总统", 48, 92, 82, 74, 86, ["NavalMastery", "Tactician", "IronFist"], "Successor", "潜艇部队司令·法定继任"),
              p("赫尔曼·戈林", "戈林", "赫尔曼", "帝国元帅", 46, 76, 78, 74, 82, ["Ambitious", "Extravagant", "Hawkish"], "Successor", "空军总司令"),
              p("阿尔伯特·施佩尔", "施佩尔", "阿尔伯特", "军备部长", 34, 68, 94, 76, 80, ["Genius", "Administrator", "Financier", "Diligent"], "Successor", "战时工业奇迹缔造者"),
          ],
          notables: [
              p("埃里希·冯·曼施坦因", "曼施坦因", "埃里希", "陆军元帅", 51, 98, 84, 70, 88, ["Genius", "Strategist", "Tactician", "BattleHardened"], "WarCommander", "镰刀计划总设计师"),
              p("海因茨·古德里安", "古德里安", "海因茨", "装甲兵上将", 51, 97, 80, 64, 88, ["Genius", "Tactician", "BattleHardened", "Conqueror"], "WarCommander", "闪电战之父"),
              p("埃尔温·隆美尔", "隆美尔", "埃尔温", "陆军元帅", 47, 96, 74, 72, 92, ["Brave", "Tactician", "BattleHardened", "NaturalLeader"], "WarCommander", "沙漠之狐"),
              p("格尔德·冯·伦德施泰特", "伦德施泰特", "格尔德", "陆军元帅", 63, 91, 80, 74, 86, ["Veteran", "Strategist", "Patient"], "WarCommander", "南方集团军群总司令"),
              p("瓦尔特·莫德尔", "莫德尔", "瓦尔特", "陆军元帅", 48, 93, 76, 62, 84, ["BattleHardened", "Stubborn", "Tactician"], "WarCommander", "元首的救火队员"),
              p("卡尔·邓尼茨", "邓尼茨", "卡尔", "海军元帅", 48, 92, 82, 74, 86, ["NavalMastery", "ShipMaster", "Tactician"], "Admiral", "狼群战术缔造者"),
              p("埃里希·雷德尔", "雷德尔", "埃里希", "海军总司令·元帅", 63, 88, 84, 72, 82, ["NavalMastery", "Veteran", "Administrator"], "Admiral", "德国海军总司令"),
              p("阿尔伯特·施佩尔", "施佩尔", "阿尔伯特", "帝国军备部长", 34, 68, 94, 76, 80, ["Administrator", "Financier", "Diligent"], "Chancellor", "战时工业总监"),
          ],
          families: [
              f("克虏伯", "鲁尔重工军工集团", 86, 80, ruling: true),
              f("曼施坦因", "普鲁士国防军将门", 80, 76),
              f("施佩尔", "帝国军备官僚系", 72, 80),
          ],
          parties: [pt("国家社会主义德意志工人党", 100)],
          power: pw(ind: 3.40, mp: 1.75, mil: 6, eco: 6, sta: 5, nav: 4, fleets: 3, ships: 7, navBonus: 0.28,
                    traits: ["FieldCombatElite", "Conqueror", "WellTrained", "SiegeCapture", "CavalryTradition"],
                    lifetime: true, term: 40, nukes: 0, nucProg: 0.0, reactors: 0, warSupport: 92, startArmies: 16, maxArmies: 28)
        ),
        // 1 苏联（1939.9 尚未全面转入卫国战争，仅于西线与核心枢纽常备 14 师，严禁在西伯利亚/远东无脑铺兵；开战后可动员至 30 师）
        n(1,
          founder: p("约瑟夫·斯大林", "朱加什维利", "约瑟夫", "联共(布)总书记·大元帅", 56, 85, 92, 84, 90, ["IronFist", "Stubborn", "Administrator", "Visionary"], "Ruler", "苏联最高统帅"),
          successors: [
              p("尼基塔·赫鲁晓夫", "赫鲁晓夫", "尼基塔", "苏共中央第一书记", 45, 76, 84, 82, 84, ["Reformer", "Ambitious", "Hawkish"], "Successor", "苏联改革领袖"),
              p("格奥尔基·马林科夫", "马林科夫", "格奥尔基", "部长会议主席", 37, 68, 86, 78, 76, ["Administrator", "Diligent"], "Successor", "战时国防委员会成员"),
              p("列昂尼德·勃列日涅夫", "勃列日涅夫", "列昂尼德", "苏共中央总书记", 33, 74, 80, 80, 82, ["Patient", "Veteran"], "Successor", "苏联鼎盛期领导人"),
          ],
          notables: [
              p("格奥尔基·朱可夫", "朱可夫", "格奥尔基", "苏联元帅", 42, 97, 82, 72, 92, ["Genius", "BattleHardened", "Strategist", "IronFist", "NaturalLeader"], "WarCommander", "胜利元帅"),
              p("康斯坦丁·罗科索夫斯基", "罗科索夫斯基", "康斯坦丁", "苏联元帅", 42, 95, 80, 76, 92, ["Genius", "Tactician", "BattleHardened", "Charismatic"], "WarCommander", "巴格拉季昂之剑"),
              p("亚历山大·华西列夫斯基", "华西列夫斯基", "亚历山大", "总参谋长·苏联元帅", 44, 94, 90, 78, 86, ["Genius", "Strategist", "Diligent", "Administrator"], "Chancellor", "红军总参谋长"),
              p("伊万·科涅夫", "科涅夫", "伊万", "苏联元帅", 41, 93, 76, 68, 86, ["Brave", "BattleHardened", "Conqueror"], "WarCommander", "乌克兰第一方面军司令"),
              p("维亚切斯拉夫·莫洛托夫", "莫洛托夫", "维亚切斯拉夫", "外交人民委员", 49, 60, 86, 88, 78, ["MasterDiplomat", "Stubborn", "Administrator"], "Diplomat", "苏联铁腕外长"),
              p("尼古拉·库兹涅佐夫", "库兹涅佐夫", "尼古拉", "海军人民委员·元帅", 35, 88, 82, 74, 84, ["NavalMastery", "ShipMaster", "Brave"], "Admiral", "苏联红海军总司令"),
          ],
          families: [
              f("朱加什维利", "克里姆林宫最高统帅部", 92, 80, ruling: true),
              f("朱可夫", "红军总参将帅集团", 80, 78),
              f("莫洛托夫", "苏联国家计划委员会", 74, 80),
          ],
          parties: [pt("苏联共产党", 100)],
          power: pw(ind: 2.30, mp: 2.20, mil: 4, eco: 5, sta: 5, nav: 3, fleets: 3, ships: 6, navBonus: 0.16,
                    traits: ["HomelandDefense", "FightToTheEnd", "CoreDefense"],
                    lifetime: true, term: 40, nukes: 0, nucProg: 0.0, reactors: 0, warSupport: 85, startArmies: 14, maxArmies: 30)
        ),
        // 2 大英帝国（1939年9月双首脑：乔治六世为国王，张伯伦任首相，丘吉尔任第一海军大臣兼战时接班人）
        n(2,
          founder: p("乔治六世", "温莎", "乔治", "大英帝国国王", 43, 72, 82, 86, 90, ["Brave", "Just", "Beloved", "Stubborn"], "Ruler", "温莎王朝战时国王"),
          successors: [
              p("伊丽莎白二世", "温莎", "伊丽莎白", "英国女王", 18, 68, 86, 90, 92, ["Patient", "Just", "Beloved"], "Successor", "法定王储", gender: 1),
          ],
          notables: [
              p("内维尔·张伯伦", "张伯伦", "内维尔", "大英帝国首相", 64, 62, 84, 80, 76, ["Administrator", "Dovish", "Patient"], "Chancellor", "1939年9月在任首相"),
              p("温斯顿·丘吉尔", "丘吉尔", "温斯顿", "第一海军大臣·战时领袖", 64, 84, 89, 94, 96, ["Visionary", "Charismatic", "Stubborn", "MasterDiplomat", "SeaVision"], "Treasurer", "战时铁腕领袖"),
              p("伯纳德·蒙哥马利", "蒙哥马利", "伯纳德", "陆军元帅", 51, 93, 82, 70, 88, ["Strategist", "Patient", "BattleHardened", "Veteran"], "WarCommander", "阿拉曼胜帅"),
              p("艾伦·布鲁克", "布鲁克", "艾伦", "帝国总参谋长·元帅", 56, 90, 90, 80, 84, ["Strategist", "Administrator", "Diligent"], "WarCommander", "盟军战略舵手"),
              p("安德鲁·坎宁安", "坎宁安", "安德鲁", "第一海务大臣·元帅", 56, 95, 84, 78, 90, ["Genius", "NavalMastery", "ShipMaster", "Brave"], "Admiral", "地中海战神·皇家海军灵魂"),
              p("路易斯·蒙巴顿", "蒙巴顿", "路易斯", "海军元帅", 39, 86, 82, 86, 90, ["NavalMastery", "Charismatic", "Diplomatic"], "Admiral", "东南亚盟军总司令"),
              p("安东尼·艾登", "艾登", "安东尼", "外交大臣", 42, 66, 82, 90, 84, ["MasterDiplomat", "Charismatic"], "Diplomat", "战时外相"),
          ],
          families: [
              f("温莎", "温莎王室", 90, 85, ruling: true),
              f("丘吉尔", "保守党主战派", 84, 82),
              f("张伯伦", "伯明翰保守党元老派", 76, 74),
              f("蒙巴顿", "皇家海军勋贵", 74, 80),
          ],
          parties: [pt("保守党", 58), pt("工党", 32), pt("自由党", 10)],
          power: pw(ind: 3.10, mp: 1.55, mil: 5, eco: 6, sta: 6, nav: 6, fleets: 6, ships: 11, navBonus: 0.45,
                    traits: ["WellTrained", "FightToTheEnd", "HomelandDefense", "StrengthenCore"],
                    lifetime: true, term: 40, nukes: 0, nucProg: 0.0, reactors: 0, warSupport: 86, startArmies: 9, maxArmies: 18),
          familyRelations: [fr("丘吉尔", "张伯伦", -28)]
        ),
        // 3 法国
        n(3,
          founder: p("爱德华·达拉第", "达拉第", "爱德华", "法兰西总理", 55, 66, 78, 76, 76, ["Patient", "Dovish", "Administrator"], "Ruler", "第三共和国总理"),
          successors: [
              p("保罗·雷诺", "雷诺", "保罗", "战时总理", 60, 72, 84, 80, 80, ["Financier", "Hawkish", "Reformer"], "Successor", "主战派总理"),
              p("夏尔·戴高乐", "戴高乐", "夏尔", "自由法国领袖·总统", 48, 91, 88, 90, 94, ["Visionary", "Brave", "Stubborn", "NaturalLeader", "Tactician"], "Successor", "自由法国之魂"),
              p("菲利普·贝当", "贝当", "菲利普", "法国元帅", 64, 82, 74, 70, 80, ["Veteran", "Dovish"], "Successor", "一战老元帅"),
          ],
          notables: [
              p("莫里斯·甘末林", "甘末林", "莫里斯", "法军总司令", 62, 74, 78, 72, 74, ["Patient", "Veteran"], "WarCommander", "联军初期总司令"),
              p("夏尔·戴高乐", "戴高乐", "夏尔", "第4装甲师师长", 48, 91, 88, 90, 94, ["Visionary", "Brave", "Tactician", "NaturalLeader"], "WarCommander", "装甲战先驱"),
              p("马克西姆·魏刚", "魏刚", "马克西姆", "法军总司令", 63, 82, 78, 74, 78, ["Veteran", "BattleHardened"], "WarCommander", "福煦参谋长"),
              p("弗朗索瓦·达尔朗", "达尔朗", "弗朗索瓦", "海军元帅", 58, 86, 82, 76, 78, ["NavalMastery", "ShipMaster", "Administrator"], "Admiral", "法国公海舰队总司令"),
          ],
          families: [
              f("达拉第", "第三共和国议会派", 80, 80, ruling: true),
              f("戴高乐", "自由法国将官系", 74, 74),
          ],
          parties: [pt("激进社会党", 40), pt("工人国际法国支部", 35), pt("民主联盟", 25)],
          power: pw(ind: 2.30, mp: 1.40, mil: 4, eco: 5, sta: 5, nav: 5, fleets: 4, ships: 8, navBonus: 0.28,
                    traits: ["CoreDefense", "HomelandDefense"], lifetime: false, term: 4, warSupport: 68, startArmies: 12, maxArmies: 20)
        ),
        // 4 波兰
        n(4,
          founder: p("爱德华·希米格维", "希米格维", "爱德华", "波兰元帅", 53, 80, 76, 72, 82, ["Brave", "Hawkish", "Veteran"], "Ruler", "波兰武装力量总司令"),
          successors: [
              p("瓦迪斯瓦夫·西科尔斯基", "西科尔斯基", "瓦迪斯瓦夫", "流亡政府总理·上将", 58, 86, 84, 86, 88, ["Strategist", "Diplomatic", "Brave"], "Successor", "自由波兰领袖"),
          ],
          notables: [
              p("瓦迪斯瓦夫·安德斯", "安德斯", "瓦迪斯瓦夫", "陆军中将", 47, 88, 76, 74, 88, ["Brave", "BattleHardened", "NaturalLeader"], "WarCommander", "卡西诺山攻克者"),
              p("约瑟夫·贝克", "贝克", "约瑟夫", "外交部长", 44, 62, 78, 82, 78, ["Diplomatic", "Stubborn"], "Diplomat", "波兰外交部长"),
          ],
          families: [
              f("毕苏斯基", "萨纳齐亚军政派", 82, 80, ruling: true),
              f("西科尔斯基", "波兰宪政抵抗派", 72, 72),
          ],
          parties: [pt("萨纳齐亚阵营", 48), pt("波兰人民党", 28), pt("波兰国家党", 24)],
          power: pw(ind: 1.40, mp: 1.20, mil: 3, eco: 4, sta: 4, nav: 2, fleets: 1, ships: 4, navBonus: 0.10,
                    traits: ["FightToTheEnd", "HomelandDefense", "CavalryTradition"], lifetime: false, term: 5, warSupport: 88, startArmies: 7, maxArmies: 11)
        ),
        // 5 意大利王国（双首脑：维托里奥·埃马努埃莱三世为国王，墨索里尼为国家领袖兼首相掌实权）
        n(5,
          founder: p("维托里奥·埃马努埃莱三世", "萨伏伊", "维托里奥", "意大利国王", 64, 62, 72, 74, 72, ["Patient", "Stubborn"], "Ruler", "萨伏伊王朝国王"),
          successors: [
              p("翁贝托二世", "萨伏伊", "翁贝托", "王储", 35, 66, 74, 76, 78, ["Diplomatic", "Charismatic"], "Successor", "萨伏伊王太子"),
          ],
          notables: [
              p("贝尼托·墨索里尼", "墨索里尼", "贝尼托", "国家领袖·首相", 56, 70, 76, 74, 88, ["Ambitious", "Charismatic", "Hawkish", "Stubborn"], "Chancellor", "意大利法西斯实际掌权者"),
              p("伊塔洛·巴尔博", "巴尔博", "伊塔洛", "空军元帅", 43, 86, 80, 78, 88, ["Brave", "Visionary", "Charismatic"], "WarCommander", "意大利空军名帅"),
              p("乔瓦尼·梅塞", "梅塞", "乔瓦尼", "陆军元帅", 55, 90, 74, 68, 84, ["BattleHardened", "Tactician", "Veteran"], "WarCommander", "意大利最杰出野战将领"),
              p("安杰洛·亚基诺", "亚基诺", "安杰洛", "海军上将", 50, 84, 76, 70, 78, ["NavalMastery", "ShipMaster"], "Admiral", "意大利地中海主力舰队司令"),
              p("加莱阿佐·齐亚诺", "齐亚诺", "加莱阿佐", "外交大臣", 36, 56, 76, 82, 80, ["Diplomatic", "SocialButterfly"], "Diplomat", "意大利外长"),
          ],
          families: [
              f("萨伏伊", "萨伏伊王室", 82, 80, ruling: true),
              f("墨索里尼", "法西斯大委员会", 84, 58),
              f("阿涅利", "菲亚特工业集团", 74, 76),
          ],
          parties: [pt("国家法西斯党", 100)],
          power: pw(ind: 1.85, mp: 1.35, mil: 4, eco: 4, sta: 4, nav: 5, fleets: 4, ships: 8, navBonus: 0.28,
                    traits: ["CoreDefense", "BullyTheWeak"], lifetime: true, term: 40, warSupport: 72, startArmies: 8, maxArmies: 15),
          familyRelations: [fr("萨伏伊", "墨索里尼", -22)]
        ),
        // 6 西班牙
        n(6,
          founder: p("弗朗西斯科·佛朗哥", "佛朗哥", "弗朗西斯科", "考迪罗·大元帅", 46, 84, 82, 84, 82, ["Patient", "IronFist", "Veteran", "Diplomatic"], "Ruler", "西班牙国家元首"),
          successors: [
              p("胡安·卡洛斯一世", "波旁", "胡安·卡洛斯", "西班牙国王", 24, 68, 82, 86, 86, ["Reformer", "Diplomatic", "Just"], "Successor", "法定王储"),
          ],
          notables: [
              p("阿古斯丁·穆尼奥斯·格兰德斯", "格兰德斯", "阿古斯丁", "陆军中将", 43, 86, 72, 68, 82, ["Brave", "BattleHardened"], "WarCommander", "西班牙资深战将"),
              p("拉蒙·塞拉诺·苏涅尔", "苏涅尔", "拉蒙", "外交部长", 38, 56, 80, 82, 76, ["Administrator", "Diplomatic"], "Chancellor", "长枪党核心干才"),
          ],
          families: [
              f("佛朗哥", "民族军官团", 86, 80, ruling: true),
              f("波旁", "西班牙王室派", 66, 68),
          ],
          parties: [pt("西班牙长枪党", 100)],
          power: pw(ind: 1.25, mp: 1.10, mil: 4, eco: 3, sta: 4, nav: 3, fleets: 2, ships: 4, navBonus: 0.12,
                    traits: ["HomelandDefense", "CoreDefense"], lifetime: true, term: 40, warSupport: 64)
        ),
        // 7 芬兰
        n(7,
          founder: p("卡尔·古斯塔夫·曼纳海姆", "曼纳海姆", "卡尔·古斯塔夫", "芬兰元帅·总司令", 62, 95, 86, 88, 94, ["Genius", "Strategist", "BattleHardened", "Veteran", "NaturalLeader"], "Ruler", "冬战战神·芬兰国父"),
          successors: [
              p("里斯托·吕蒂", "吕蒂", "里斯托", "芬兰总统", 50, 66, 88, 84, 82, ["Financier", "Just", "Patient"], "Successor", "战时总统"),
              p("尤霍·巴锡基维", "巴锡基维", "尤霍", "芬兰总统", 62, 60, 86, 92, 82, ["MasterDiplomat", "Patient"], "Successor", "战后中立国策缔造者"),
          ],
          notables: [
              p("阿克塞尔·艾罗", "艾罗", "阿克塞尔", "总参谋长·中将", 41, 90, 84, 70, 80, ["Strategist", "Tactician", "Diligent"], "WarCommander", "曼纳海姆左右手"),
              p("亚尔马·西拉斯沃", "西拉斯沃", "亚尔马", "中将", 46, 91, 72, 66, 84, ["Tactician", "BattleHardened", "Brave"], "WarCommander", "苏奥穆萨尔米大捷名将"),
              p("里斯托·吕蒂", "吕蒂", "里斯托", "战时总理", 50, 66, 88, 84, 82, ["Financier", "Administrator", "Just"], "Chancellor", "战时内阁领袖"),
          ],
          families: [
              f("曼纳海姆", "芬兰国防军勋贵", 86, 80, ruling: true),
              f("吕蒂", "赫尔辛基宪政世家", 72, 78),
          ],
          parties: [pt("芬兰社会民主党", 42), pt("芬兰农民联盟", 32), pt("民族联合党", 26)],
          power: pw(ind: 1.35, mp: 0.90, mil: 5, eco: 5, sta: 5, nav: 2, fleets: 1, ships: 3, navBonus: 0.10,
                    traits: ["HomelandDefense", "FightToTheEnd", "WellTrained", "CoreDefense"], lifetime: false, term: 6, warSupport: 94)
        ),
        // 8 瑞典（君主立宪双首脑：古斯塔夫五世在位，汉松任首相）
        n(8,
          founder: p("古斯塔夫五世", "贝尔纳多特", "古斯塔夫", "瑞典国王", 64, 60, 82, 86, 82, ["Dovish", "Patient", "Diplomatic"], "Ruler", "贝尔纳多特国王"),
          successors: [
              p("古斯塔夫六世", "贝尔纳多特", "古斯塔夫·阿道夫", "瑞典国王", 56, 62, 84, 84, 84, ["Scholar", "Just"], "Successor", "王储"),
          ],
          notables: [
              p("佩尔·阿尔宾·汉松", "汉松", "佩尔·阿尔宾", "瑞典首相", 53, 62, 90, 88, 88, ["Administrator", "Dovish", "Benevolent", "Beloved"], "Chancellor", "人民之家福利国缔造者"),
              p("奥洛夫·特内尔", "特内尔", "奥洛夫", "瑞典总司令", 62, 82, 80, 74, 78, ["Patient", "Veteran"], "WarCommander", "武装中立总司令"),
              p("克里斯蒂安·京特", "京特", "克里斯蒂安", "外交大臣", 52, 54, 82, 88, 78, ["MasterDiplomat", "Patient"], "Diplomat", "战时中立外相"),
          ],
          families: [
              f("贝尔纳多特", "瑞典王室", 84, 80, ruling: true),
              f("汉松", "社会民主党执政派", 78, 80),
              f("瓦伦堡", "斯德哥尔摩工业金融世家", 78, 78),
          ],
          parties: [pt("瑞典社会民主党", 54), pt("自由人民党", 24), pt("右翼保守党", 22)],
          power: pw(ind: 1.95, mp: 0.95, mil: 4, eco: 6, sta: 6, nav: 3, fleets: 2, ships: 5, navBonus: 0.16,
                    traits: ["WellTrained", "CoreDefense", "StrengthenCore"], lifetime: true, term: 40, warSupport: 58)
        ),
        // 9 挪威（君主立宪双首脑：哈康七世在位，尼高斯沃尔任首相）
        n(9,
          founder: p("哈康七世", "格吕克斯堡", "哈康", "挪威国王", 64, 70, 80, 86, 92, ["Just", "Brave", "Beloved"], "Ruler", "国王之怒象征"),
          successors: [
              p("奥拉夫五世", "格吕克斯堡", "奥拉夫", "挪威国王", 36, 72, 80, 84, 88, ["Brave", "Beloved"], "Successor", "王储"),
          ],
          notables: [
              p("约翰·尼高斯沃尔", "尼高斯沃尔", "约翰", "挪威首相", 60, 62, 84, 80, 82, ["Benevolent", "Patient", "Administrator"], "Chancellor", "工党战时首相"),
              p("奥托·鲁格", "鲁格", "奥托", "挪威陆军总司令", 57, 84, 78, 72, 82, ["Brave", "Patient", "Veteran"], "WarCommander", "纳尔维克抵抗名将"),
          ],
          families: [
              f("格吕克斯堡", "挪威王室", 86, 80, ruling: true),
              f("尼高斯沃尔", "挪威工党内阁派", 74, 80),
              f("威廉森", "挪威商船航运世家", 70, 76),
          ],
          parties: [pt("挪威工党", 48), pt("挪威保守党", 30), pt("挪威自由党", 22)],
          power: pw(ind: 1.35, mp: 0.75, mil: 3, eco: 5, sta: 5, nav: 4, fleets: 2, ships: 5, navBonus: 0.18,
                    traits: ["HomelandDefense", "CoreDefense"], lifetime: true, term: 40, warSupport: 72)
        ),
        // 10 荷兰王国（v8.0.0 与比利时/卢森堡彻底分立！）
        n(10,
          founder: p("威廉明娜", "奥兰治-拿骚", "威廉明娜", "荷兰女王", 59, 72, 86, 88, 90, ["Stubborn", "Brave", "Beloved", "NaturalLeader"], "Ruler", "流亡抵抗象征女王", gender: 1),
          successors: [
              p("朱丽安娜", "奥兰治-拿骚", "朱丽安娜", "荷兰女王", 30, 60, 84, 86, 86, ["Benevolent", "Diplomatic", "Beloved"], "Successor", "王储", gender: 1),
          ],
          notables: [
              p("亨利·温克尔曼", "温克尔曼", "亨利", "荷军总司令", 63, 82, 78, 72, 80, ["Veteran", "Brave"], "WarCommander", "荷兰本土防卫总司令"),
              p("卡雷尔·多尔曼", "多尔曼", "卡雷尔", "海军少将", 50, 86, 74, 70, 84, ["NavalMastery", "Brave", "ShipMaster"], "Admiral", "爪哇海舰队司令"),
          ],
          families: [
              f("奥兰治-拿骚", "荷兰王室", 88, 84, ruling: true),
              f("德海尔", "海牙内阁派", 74, 78),
          ],
          parties: [pt("天主教国家党", 38), pt("社会民主工党", 34), pt("反革命党", 28)],
          power: pw(ind: 1.65, mp: 0.78, mil: 4, eco: 6, sta: 5, nav: 4, fleets: 3, ships: 6, navBonus: 0.22,
                    traits: ["CoreDefense", "StrengthenCore"], lifetime: true, term: 40, warSupport: 70)
        ),
        // 11 罗马尼亚
        n(11,
          founder: p("卡罗尔二世", "霍亨索伦-锡格马林根", "卡罗尔", "罗马尼亚国王", 45, 66, 74, 76, 74, ["Ambitious", "Extravagant"], "Ruler", "罗马尼亚国王"),
          successors: [
              p("扬·安东内斯库", "安东内斯库", "扬", "陆军元帅·国家领袖", 57, 84, 80, 72, 80, ["IronFist", "Hawkish", "BattleHardened"], "Successor", "战时铁腕元帅"),
              p("米哈伊一世", "霍亨索伦-锡格马林根", "米哈伊", "罗马尼亚国王", 18, 72, 78, 82, 84, ["Brave", "Just", "Diplomatic"], "Successor", "年轻国王"),
          ],
          notables: [
              p("扬·安东内斯库", "安东内斯库", "扬", "陆军元帅", 57, 84, 80, 72, 80, ["IronFist", "BattleHardened", "Veteran"], "WarCommander", "罗马尼亚首席元帅"),
              p("彼得·杜米特雷斯库", "杜米特雷斯库", "彼得", "第三集团军司令", 57, 82, 74, 68, 78, ["Veteran", "BattleHardened"], "WarCommander", "东线罗军上将"),
          ],
          families: [
              f("霍亨索伦-锡格马林根", "罗马尼亚王室", 82, 80, ruling: true),
              f("布勒蒂亚努", "布加勒斯特政治世家", 68, 66),
          ],
          parties: [pt("国家复兴阵线", 46), pt("国家农民党", 30), pt("铁卫团", 24)],
          power: pw(ind: 1.35, mp: 1.15, mil: 4, eco: 4, sta: 4, nav: 2, fleets: 1, ships: 3, navBonus: 0.08,
                    traits: ["CoreDefense", "HomelandDefense"], lifetime: true, term: 40, warSupport: 72)
        ),
        // 12 匈牙利
        n(12,
          founder: p("霍尔蒂·米克洛什", "霍尔蒂", "米克洛什", "王国摄政·海军上将", 64, 80, 82, 80, 84, ["NavalMastery", "Stubborn", "Veteran"], "Ruler", "无海之国海军上将摄政"),
          successors: [
              p("泰莱基·帕尔", "泰莱基", "帕尔", "首相", 60, 62, 86, 86, 82, ["Scholar", "Just", "Diplomatic"], "Successor", "地理学家首相"),
          ],
          notables: [
              p("古斯塔夫·亚尼", "亚尼", "古斯塔夫", "第二集团军司令", 56, 82, 74, 66, 78, ["BattleHardened", "Veteran"], "WarCommander", "匈牙利野战司令"),
              p("泰莱基·帕尔", "泰莱基", "帕尔", "王国首相", 60, 62, 86, 86, 82, ["Scholar", "Just", "Diplomatic"], "Chancellor", "克制派名相"),
          ],
          families: [
              f("霍尔蒂", "摄政军官贵族", 84, 80, ruling: true),
              f("泰莱基", "马扎尔大贵族", 70, 74),
          ],
          parties: [pt("匈牙利生活党", 52), pt("独立小农党", 26), pt("箭十字党", 22)],
          power: pw(ind: 1.35, mp: 1.05, mil: 4, eco: 4, sta: 4, nav: 1, fleets: 0, ships: 2, navBonus: 0.0,
                    traits: ["CavalryTradition", "WellTrained"], lifetime: true, term: 40, warSupport: 74)
        ),
        // 13 南斯拉夫
        n(13,
          founder: p("保罗亲王", "卡拉乔尔杰维奇", "保罗", "王国摄政王", 46, 66, 78, 84, 78, ["Diplomatic", "Patient", "Scholar"], "Ruler", "南斯拉夫摄政王"),
          successors: [
              p("约瑟普·布罗兹·铁托", "布罗兹", "约瑟普·铁托", "元帅·总统", 47, 92, 88, 90, 94, ["Genius", "BattleHardened", "Unifier", "Charismatic", "NaturalLeader"], "Successor", "游击队统帅·不结盟领袖"),
          ],
          notables: [
              p("约瑟普·布罗兹·铁托", "布罗兹", "约瑟普·铁托", "反法西斯统帅", 47, 92, 88, 90, 94, ["Genius", "BattleHardened", "Charismatic"], "WarCommander", "巴尔干游击战传奇"),
              p("杜尚·西莫维奇", "西莫维奇", "杜尚", "空军上将", 56, 80, 76, 74, 80, ["Brave", "Veteran"], "Chancellor", "南斯拉夫军界首脑"),
          ],
          families: [
              f("卡拉乔尔杰维奇", "塞尔维亚王室", 82, 80, ruling: true),
              f("马切克", "克罗地亚政治世家", 68, 60),
          ],
          parties: [pt("南斯拉夫激进联盟", 42), pt("克罗地亚农民党", 32), pt("南斯拉夫共产党", 26)],
          power: pw(ind: 1.15, mp: 1.15, mil: 3, eco: 3, sta: 3, nav: 2, fleets: 1, ships: 3, navBonus: 0.08,
                    traits: ["HomelandDefense", "FightToTheEnd"], lifetime: true, term: 40, warSupport: 76)
        ),
        // 14 希腊王国（双首脑：乔治二世为国王，梅塔克萨斯任王国首相掌政）
        n(14,
          founder: p("乔治二世", "格吕克斯堡", "乔治", "希腊国王", 49, 68, 76, 80, 78, ["Patient", "Diplomatic"], "Ruler", "格吕克斯堡王朝希腊国王"),
          successors: [
              p("保罗一世", "格吕克斯堡", "保罗", "王储", 38, 68, 78, 80, 80, ["Patient", "Just"], "Successor", "希腊王储"),
          ],
          notables: [
              p("扬尼斯·梅塔克萨斯", "梅塔克萨斯", "扬尼斯", "希腊王国首相", 62, 84, 82, 78, 84, ["Stubborn", "IronFist", "Veteran", "Brave"], "Chancellor", "「不！」日抗意铁腕首相"),
              p("亚历山德罗斯·帕帕戈斯", "帕帕戈斯", "亚历山德罗斯", "陆军元帅", 55, 89, 80, 74, 86, ["BattleHardened", "Tactician", "Veteran"], "WarCommander", "阿尔巴尼亚反攻名帅"),
              p("亚历山德罗斯·萨凯拉里乌", "萨凯拉里乌", "亚历山德罗斯", "海军中将", 52, 82, 74, 70, 78, ["NavalMastery", "Brave"], "Admiral", "希腊皇家海军司令"),
          ],
          families: [
              f("格吕克斯堡", "希腊王室", 84, 80, ruling: true),
              f("梅塔克萨斯", "八四政权内阁派", 80, 74),
              f("帕帕戈斯", "雅典将门", 70, 78),
          ],
          parties: [pt("八四政权派", 100)],
          power: pw(ind: 1.05, mp: 0.90, mil: 4, eco: 3, sta: 4, nav: 3, fleets: 2, ships: 4, navBonus: 0.16,
                    traits: ["HomelandDefense", "FightToTheEnd", "DefyTheStrong"], lifetime: true, term: 40, warSupport: 88, startArmies: 4, maxArmies: 7)
        ),
        // 15 土耳其
        n(15,
          founder: p("伊斯梅特·伊纳尼", "伊纳尼", "伊斯梅特", "土耳其总统", 54, 84, 88, 92, 84, ["MasterDiplomat", "Patient", "Veteran", "Administrator"], "Ruler", "国家元首·武装中立舵手"),
          successors: [
              p("杰拉勒·拜亚尔", "拜亚尔", "杰拉勒", "土耳其总统", 56, 62, 86, 82, 82, ["Financier", "Reformer", "Administrator"], "Successor", "第三任总统"),
          ],
          notables: [
              p("费夫齐·恰克马克", "恰克马克", "费夫齐", "总参谋长·元帅", 62, 88, 80, 74, 86, ["Veteran", "BattleHardened", "Patient"], "WarCommander", "独立战争功勋元帅"),
              p("许克吕·萨拉焦卢", "萨拉焦卢", "许克吕", "外交部长·总理", 52, 58, 84, 88, 80, ["MasterDiplomat", "Financier"], "Chancellor", "战时总理"),
          ],
          families: [
              f("伊纳尼", "凯末尔共和精英派", 86, 80, ruling: true),
              f("拜亚尔", "安纳托利亚改革派", 70, 72),
          ],
          parties: [pt("共和人民党", 76), pt("独立民主派", 24)],
          power: pw(ind: 1.25, mp: 1.20, mil: 4, eco: 4, sta: 5, nav: 2, fleets: 1, ships: 4, navBonus: 0.10,
                    traits: ["HomelandDefense", "CoreDefense"], lifetime: false, term: 4, warSupport: 72)
        ),
        // 16 比利时王国
        n(16,
          founder: p("利奥波德三世", "萨克森-科堡", "利奥波德", "比利时国王", 38, 74, 78, 76, 78, ["Stubborn", "Patient"], "Ruler", "比利时国王"),
          successors: [p("博杜安", "萨克森-科堡", "博杜安", "王储", 18, 66, 80, 84, 84, ["Benevolent", "Just"], "Successor", "比利时王储")],
          notables: [
              p("于贝尔·皮埃洛", "皮埃洛", "于贝尔", "比利时首相", 55, 62, 82, 80, 78, ["Administrator", "Stubborn"], "Chancellor", "战时流亡首相"),
              p("拉乌尔·范·奥弗斯特拉滕", "奥弗斯特拉滕", "拉乌尔", "军事顾问·少将", 54, 82, 78, 72, 76, ["Strategist", "Veteran"], "WarCommander", "比军参谋主将"),
          ],
          families: [f("萨克森-科堡", "比利时王室", 84, 80, ruling: true)],
          parties: [pt("天主教联盟", 42), pt("比利时工党", 36), pt("自由党", 22)],
          power: pw(ind: 1.65, mp: 0.80, mil: 4, eco: 6, sta: 5, nav: 2, fleets: 1, ships: 3, navBonus: 0.08,
                    traits: ["CoreDefense", "HomelandDefense"], lifetime: true, term: 40, warSupport: 76)
        ),
        // 17 卢森堡大公国
        n(17,
          founder: p("夏洛特女大公", "拿骚-魏尔堡", "夏洛特", "卢森堡女大公", 43, 56, 82, 86, 88, ["Dovish", "Beloved"], "Ruler", "卢森堡抵抗象征", gender: 1),
          successors: [p("让大公", "拿骚-魏尔堡", "让", "王储", 18, 66, 82, 84, 84, ["Brave", "Just"], "Successor", "卢森堡储君")],
          notables: [p("皮埃尔·迪蓬", "迪蓬", "皮埃尔", "卢森堡首相", 54, 56, 84, 84, 80, ["Administrator", "Diplomatic"], "Chancellor", "流亡政府首相")],
          families: [f("拿骚-魏尔堡", "卢森堡大公室", 84, 84, ruling: true)],
          parties: [pt("右翼党", 52), pt("工人党", 48)],
          power: pw(ind: 0.72, mp: 0.38, mil: 3, eco: 5, sta: 5, nav: 1, fleets: 0, ships: 0, navBonus: 0.0,
                    traits: ["CoreDefense"], lifetime: true, term: 40, warSupport: 60, startArmies: 1, maxArmies: 2)
        ),
        // 18 瑞士联邦
        n(18,
          founder: p("亨利·吉桑", "吉桑", "亨利", "瑞士联邦总司令", 64, 88, 88, 88, 90, ["Strategist", "Patient", "Just", "Beloved"], "Ruler", "阿尔卑斯堡垒总司令"),
          successors: [p("马塞尔·皮莱-戈拉兹", "皮莱-戈拉兹", "马塞尔", "联邦主席", 50, 58, 86, 88, 80, ["MasterDiplomat", "Financier"], "Successor", "联邦主席")],
          notables: [p("恩斯特·诺布斯", "诺布斯", "恩斯特", "联邦委员", 53, 58, 86, 84, 80, ["Financier", "Administrator"], "Chancellor", "瑞士战时财长")],
          families: [f("吉桑", "联邦武装中立派", 84, 84, ruling: true)],
          parties: [pt("自由民主党", 42), pt("社会民主党", 32), pt("天主教保守党", 26)],
          power: pw(ind: 1.95, mp: 0.78, mil: 5, eco: 6, sta: 6, nav: 1, fleets: 0, ships: 0, navBonus: 0.0,
                    traits: ["HomelandDefense", "CoreDefense", "WellTrained"], lifetime: false, term: 4, warSupport: 84)
        ),
        // 19 丹麦王国
        n(19,
          founder: p("克里斯蒂安十世", "格吕克斯堡", "克里斯蒂安", "丹麦国王", 64, 66, 82, 84, 90, ["Just", "Beloved", "Patient"], "Ruler", "哥本哈根骑马国王"),
          successors: [p("腓特烈九世", "格吕克斯堡", "腓特烈", "王储", 40, 68, 80, 82, 84, ["NavalMastery", "Beloved"], "Successor", "丹麦王储")],
          notables: [p("索瓦尔·斯陶宁", "斯陶宁", "索瓦尔", "丹麦首相", 64, 58, 86, 84, 84, ["Benevolent", "Administrator"], "Chancellor", "社会民主党首相")],
          families: [f("格吕克斯堡", "丹麦王室", 86, 84, ruling: true)],
          parties: [pt("社会民主党", 52), pt("自由党", 28), pt("保守人民党", 20)],
          power: pw(ind: 1.35, mp: 0.65, mil: 3, eco: 5, sta: 5, nav: 3, fleets: 2, ships: 4, navBonus: 0.14,
                    traits: ["CoreDefense"], lifetime: true, term: 40, warSupport: 64)
        ),
        // 20 葡萄牙共和国
        n(20,
          founder: p("安东尼奥·萨拉查", "萨拉查", "安东尼奥", "部长会议主席", 50, 66, 88, 86, 78, ["Financier", "Patient", "Administrator"], "Ruler", "新国家体制总理"),
          successors: [p("奥斯卡·卡尔莫纳", "卡尔莫纳", "奥斯卡", "总统·元帅", 64, 74, 78, 78, 78, ["Veteran", "Patient"], "Successor", "共和国总统")],
          notables: [p("费尔南多·桑托斯·科斯塔", "科斯塔", "费尔南多", "陆军部长", 40, 80, 80, 74, 76, ["Administrator", "Veteran"], "WarCommander", "葡军重整大臣")],
          families: [f("萨拉查", "里斯本新国家派", 84, 82, ruling: true)],
          parties: [pt("国民联盟", 100)],
          power: pw(ind: 1.05, mp: 0.78, mil: 3, eco: 4, sta: 5, nav: 3, fleets: 2, ships: 4, navBonus: 0.14,
                    traits: ["CoreDefense"], lifetime: true, term: 40, warSupport: 60)
        ),
        // 21 爱尔兰自由邦
        n(21,
          founder: p("埃蒙·德瓦莱拉", "德瓦莱拉", "埃蒙", "爱尔兰总理", 56, 70, 84, 86, 84, ["Stubborn", "Diplomatic", "Scholar"], "Ruler", "爱尔兰战时中立总理"),
          successors: [p("肖恩·勒马斯", "勒马斯", "肖恩", "副总理", 40, 68, 86, 82, 82, ["Financier", "Reformer"], "Successor", "爱尔兰经济改革家")],
          notables: [p("丹尼尔·麦肯纳", "麦肯纳", "丹尼尔", "总参谋长", 47, 80, 78, 72, 78, ["Veteran", "Patient"], "WarCommander", "爱尔兰国防军参谋长")],
          families: [f("德瓦莱拉", "共和党执政系", 82, 82, ruling: true)],
          parties: [pt("共和党", 56), pt("统一党", 30), pt("工党", 14)],
          power: pw(ind: 0.95, mp: 0.62, mil: 3, eco: 4, sta: 5, nav: 2, fleets: 1, ships: 2, navBonus: 0.06,
                    traits: ["HomelandDefense"], lifetime: false, term: 5, warSupport: 68)
        ),
        // 22 保加利亚王国
        n(22,
          founder: p("鲍里斯三世", "萨克森-科堡", "鲍里斯", "保加利亚沙皇", 45, 74, 80, 86, 84, ["MasterDiplomat", "Patient", "Beloved"], "Ruler", "务实沙皇"),
          successors: [p("西美昂二世", "萨克森-科堡", "西美昂", "王储", 18, 60, 76, 80, 80, ["Patient", "Diplomatic"], "Successor", "幼主")],
          notables: [p("尼古拉·米霍夫", "米霍夫", "尼古拉", "陆军中将", 48, 82, 76, 70, 78, ["Veteran", "BattleHardened"], "WarCommander", "保军战争部长")],
          families: [f("萨克森-科堡", "保加利亚王室", 84, 82, ruling: true)],
          parties: [pt("王室保守派", 70), pt("农民联盟", 30)],
          power: pw(ind: 1.05, mp: 0.92, mil: 4, eco: 4, sta: 4, nav: 2, fleets: 1, ships: 3, navBonus: 0.06,
                    traits: ["CoreDefense", "WellTrained"], lifetime: true, term: 40, warSupport: 70)
        ),
        // 23 斯洛伐克共和国（1939 德国附庸）
        n(23,
          founder: p("约瑟夫·蒂索", "蒂索", "约瑟夫", "斯洛伐克总统", 51, 60, 74, 70, 72, ["Dovish", "Patient"], "Ruler", "布拉迪斯拉发总统"),
          successors: [p("沃伊捷赫·图卡", "图卡", "沃伊捷赫", "总理", 59, 60, 70, 68, 66, ["IronFist", "Stubborn"], "Successor", "斯洛伐克总理")],
          notables: [p("费迪南德·恰特洛什", "恰特洛什", "费迪南德", "国防部长", 44, 78, 74, 68, 74, ["Veteran"], "WarCommander", "斯洛伐克机动师司令")],
          families: [f("蒂索", "斯洛伐克人民党", 76, 80, ruling: true)],
          parties: [pt("斯洛伐克人民党", 100)],
          power: pw(ind: 0.95, mp: 0.65, mil: 3, eco: 4, sta: 4, nav: 1, fleets: 0, ships: 0, navBonus: 0.0,
                    traits: ["CoreDefense"], lifetime: true, term: 40, warSupport: 58)
        ),
        // 24 立陶宛共和国
        n(24,
          founder: p("安塔纳斯·斯梅托纳", "斯梅托纳", "安塔纳斯", "立陶宛总统", 64, 66, 78, 76, 76, ["Stubborn", "Patient"], "Ruler", "立陶宛总统"),
          successors: [p("斯塔西斯·拉什蒂基斯", "拉什蒂基斯", "斯塔西斯", "陆军总司令", 43, 82, 76, 72, 78, ["Veteran", "Brave"], "Successor", "立军总司令")],
          notables: [p("斯塔西斯·拉什蒂基斯", "拉什蒂基斯", "斯塔西斯", "总司令", 43, 82, 76, 72, 78, ["Veteran", "Brave"], "WarCommander", "波罗的海守军将领")],
          families: [f("斯梅托纳", "立陶宛民族联盟", 78, 80, ruling: true)],
          parties: [pt("立陶宛民族联盟", 100)],
          power: pw(ind: 0.78, mp: 0.60, mil: 3, eco: 4, sta: 4, nav: 1, fleets: 0, ships: 2, navBonus: 0.04,
                    traits: ["HomelandDefense"], lifetime: true, term: 40, warSupport: 70)
        ),
        // 25 拉脱维亚共和国
        n(25,
          founder: p("卡尔利斯·乌尔马尼斯", "乌尔马尼斯", "卡尔利斯", "拉脱维亚总统", 62, 66, 80, 76, 80, ["Administrator", "Patient"], "Ruler", "拉脱维亚国父总统"),
          successors: [p("克里斯亚尼斯·贝尔基斯", "贝尔基斯", "克里斯亚尼斯", "陆军上将", 55, 80, 76, 70, 78, ["Veteran", "Brave"], "Successor", "拉脱维亚陆军总司令")],
          notables: [p("克里斯亚尼斯·贝尔基斯", "贝尔基斯", "克里斯亚尼斯", "总司令", 55, 80, 76, 70, 78, ["Veteran", "Brave"], "WarCommander", "里加守将")],
          families: [f("乌尔马尼斯", "农民联盟派", 80, 82, ruling: true)],
          parties: [pt("拉脱维亚农民联盟", 100)],
          power: pw(ind: 0.78, mp: 0.55, mil: 3, eco: 4, sta: 4, nav: 2, fleets: 1, ships: 2, navBonus: 0.06,
                    traits: ["HomelandDefense"], lifetime: true, term: 40, warSupport: 70)
        ),
        // 26 爱沙尼亚共和国
        n(26,
          founder: p("康斯坦丁·帕茨", "帕茨", "康斯坦丁", "爱沙尼亚总统", 64, 66, 80, 78, 78, ["Administrator", "Lawgiver"], "Ruler", "爱沙尼亚总统"),
          successors: [p("约翰·莱多内尔", "莱多内尔", "约翰", "陆军总司令", 55, 84, 78, 74, 82, ["Tactician", "Veteran"], "Successor", "独立战争英雄")],
          notables: [p("约翰·莱多内尔", "莱多内尔", "约翰", "总司令", 55, 84, 78, 74, 82, ["Tactician", "Veteran"], "WarCommander", "爱沙尼亚名将")],
          families: [f("帕茨", "塔林爱国阵线", 78, 80, ruling: true)],
          parties: [pt("爱国联盟", 100)],
          power: pw(ind: 0.75, mp: 0.50, mil: 3, eco: 4, sta: 4, nav: 2, fleets: 1, ships: 2, navBonus: 0.06,
                    traits: ["HomelandDefense"], lifetime: true, term: 40, warSupport: 70)
        ),
    ]

    // MARK: - 剧本 9：二战亚洲太平洋 · 太平洋风暴（公元 1941 年，9 国）

    private static let ww2Asia1941: [HistoricalNationRoster] = [
        // 0 中华民国国民政府
        n(0,
          founder: p("蒋中正", "蒋", "中正", "国民政府军事委员会委员长", 54, 82, 84, 86, 88, ["Stubborn", "BattleHardened", "Diplomatic", "IronFist"], "Ruler", "中国战区最高统帅"),
          successors: [
              p("李宗仁", "李", "宗仁", "代总统·陆军一级上将", 50, 91, 82, 82, 88, ["BattleHardened", "Tactician", "NaturalLeader"], "Successor", "台儿庄胜帅·桂系领袖"),
              p("陈诚", "陈", "诚", "行政院长·副总统", 43, 84, 88, 80, 82, ["Administrator", "Diligent", "Reformer"], "Successor", "土木系核心"),
              p("严家淦", "严", "家淦", "总统", 36, 56, 90, 84, 80, ["Financier", "Administrator", "Patient"], "Successor", "财经名臣"),
          ],
          notables: [
              p("李宗仁", "李", "宗仁", "第五战区司令长官", 50, 91, 82, 82, 88, ["BattleHardened", "Tactician", "NaturalLeader"], "WarCommander", "台儿庄大捷统帅"),
              p("白崇禧", "白", "崇禧", "副总参谋长·上将", 48, 93, 84, 80, 86, ["Genius", "Strategist", "Tactician"], "WarCommander", "小诸葛·国防战略家"),
              p("薛岳", "薛", "岳", "第九战区司令长官", 45, 94, 76, 72, 90, ["Brave", "BattleHardened", "Tactician"], "WarCommander", "长沙会战天炉战法名将"),
              p("孙立人", "孙", "立人", "新38师师长", 41, 92, 80, 82, 88, ["Tactician", "BattleHardened", "Brave", "Scholar"], "WarCommander", "东方隆美尔·仁安羌英雄"),
              p("杜聿明", "杜", "聿明", "第5军军长", 37, 89, 76, 70, 84, ["BattleHardened", "Tactician", "Brave"], "WarCommander", "昆仑关大捷名将"),
              p("卫立煌", "卫", "立煌", "中国远征军司令长官", 44, 88, 78, 76, 84, ["BattleHardened", "Patient", "Veteran"], "WarCommander", "忻口与滇西名将"),
              p("宋子文", "宋", "子文", "外交部长·行政院长", 47, 56, 88, 90, 84, ["Financier", "MasterDiplomat", "Administrator"], "Chancellor", "战时财经外交重臣"),
          ],
          families: [
              f("蒋", "国民党中央黄埔系", 88, 80, ruling: true),
              f("李", "新桂系将门", 74, 52),
              f("阎", "晋绥系", 66, 48),
              f("宋", "江浙财政世家", 72, 78),
          ],
          parties: [pt("国民党中央派", 55), pt("桂系", 20), pt("晋绥系", 15), pt("川军系", 10)],
          power: pw(ind: 0.48, mp: 2.35, mil: 2, eco: 2, sta: 3, nav: 1, fleets: 0, ships: 0, navBonus: 0.0,
                    traits: ["HomelandDefense", "FightToTheEnd", "CoreDefense"], lifetime: true, term: 40, nukes: 0, nucProg: 0.0, reactors: 0, warSupport: 88, startArmies: 11, maxArmies: 20),
          familyRelations: [fr("蒋", "李", -24), fr("蒋", "阎", -18)]
        ),
        // 1 延安抗日根据地（史实轻装游击编制，依托山地与持久战抗衡，无现代工业与海空）
        n(1,
          founder: p("毛泽东", "毛", "泽东", "中共中央军委主席", 48, 96, 95, 90, 97, ["Genius", "Strategist", "Visionary", "Charismatic", "Beloved"], "Ruler", "论持久战战略家"),
          successors: [
              p("周恩来", "周", "恩来", "副主席·政务院总理", 43, 84, 96, 98, 96, ["Genius", "MasterDiplomat", "Administrator", "Diligent", "Beloved"], "Successor", "人民好总理"),
              p("邓小平", "邓", "小平", "前委书记·政治局常委", 37, 90, 96, 92, 92, ["Reformer", "Visionary", "Strategist", "IronFist"], "Successor", "改革开放总设计师"),
              p("朱德", "朱", "德", "第十八集团军总司令", 55, 94, 84, 80, 94, ["Veteran", "BattleHardened", "Benevolent", "NaturalLeader"], "Successor", "红军之父·总司令"),
          ],
          notables: [
              p("朱德", "朱", "德", "八路军总司令", 55, 94, 84, 80, 94, ["Veteran", "BattleHardened", "Benevolent", "NaturalLeader"], "WarCommander", "人民军队总司令"),
              p("彭德怀", "彭", "德怀", "八路军副总司令", 43, 96, 80, 72, 90, ["Brave", "BattleHardened", "Tactician", "IronFist"], "WarCommander", "百团大战总指挥"),
              p("林彪", "林", "彪", "第115师师长", 34, 96, 78, 70, 84, ["Genius", "Strategist", "Tactician", "BattleHardened"], "WarCommander", "平型关大捷名将"),
              p("刘伯承", "刘", "伯承", "第129师师长", 49, 95, 84, 76, 88, ["Genius", "Strategist", "Scholar", "Tactician"], "WarCommander", "军神·太行砥柱"),
              p("粟裕", "粟", "裕", "新四军第1师师长", 34, 97, 82, 74, 88, ["Genius", "Tactician", "BattleHardened", "Brave"], "WarCommander", "华东战神"),
              p("周恩来", "周", "恩来", "中共中央副主席", 43, 84, 96, 98, 96, ["Genius", "MasterDiplomat", "Administrator", "Diligent"], "Chancellor", "统一战线与外交奇才"),
              p("陈毅", "陈", "毅", "新四军代军长", 40, 89, 86, 88, 92, ["Charismatic", "Diplomatic", "BattleHardened"], "Diplomat", "华中抗战统帅"),
              p("贺龙", "贺", "龙", "第120师师长", 45, 91, 78, 76, 92, ["Brave", "BattleHardened", "NaturalLeader"], "WarCommander", "晋绥抗日主将"),
          ],
          families: [
              f("毛", "中共中央军委", 92, 85, ruling: true),
              f("朱", "八路军总部", 82, 88),
              f("陈", "新四军军部", 76, 86),
          ],
          parties: [pt("中国共产党", 100)],
          power: pw(ind: 0.28, mp: 1.45, mil: 2, eco: 2, sta: 5, nav: 1, fleets: 0, ships: 0, navBonus: 0.0,
                    traits: ["HomelandDefense", "FightToTheEnd"], lifetime: true, term: 40, nukes: 0, nucProg: 0.0, reactors: 0, warSupport: 96, startArmies: 5, maxArmies: 11)
        ),
        // 2 大日本帝国（昭和天皇裕仁在位为国家元首，东条英机任内阁总理大臣掌政；真实陆海对立派系 + 全面工业/海空/科技降维压制）
        n(2,
          founder: p("裕仁", "", "裕仁", "天皇", 40, 74, 78, 74, 82, ["Stubborn", "Patient", "NaturalLeader"], "Ruler", "昭和天皇（日本皇室无姓氏）"),
          successors: [
              p("明仁", "", "明仁", "皇太子", 18, 58, 80, 86, 84, ["Benevolent", "Dovish", "Diplomatic"], "Successor", "皇太子·平成天皇"),
          ],
          notables: [
              p("东条英机", "东条", "英机", "内阁总理大臣", 57, 82, 80, 58, 76, ["Hawkish", "IronFist", "Stubborn"], "Chancellor", "战时内阁首相·陆军统制派首脑"),
              p("山本五十六", "山本", "五十六", "联合舰队司令长官", 57, 98, 86, 82, 94, ["Genius", "NavalMastery", "ShipMaster", "Visionary", "Strategist"], "Admiral", "航空母舰机动舰队缔造者"),
              p("山下奉文", "山下", "奉文", "第25军司令官", 56, 92, 76, 68, 86, ["Tactician", "BattleHardened", "Conqueror"], "WarCommander", "马来之虎"),
              p("南云忠一", "南云", "忠一", "第一航空舰队司令", 54, 86, 74, 66, 78, ["NavalMastery", "Veteran"], "Admiral", "机动部队指挥官"),
              p("栗林忠道", "栗林", "忠道", "陆军大将", 50, 93, 82, 78, 88, ["Strategist", "Patient", "BattleHardened", "Stubborn"], "WarCommander", "硫磺岛防御大师"),
              p("冈村宁次", "冈村", "宁次", "华北方面军司令官", 57, 86, 78, 66, 76, ["IronFist", "Veteran", "Tactician"], "WarCommander", "中国派遣军司令"),
              p("永野修身", "永野", "修身", "海军军令部总长", 61, 84, 80, 72, 78, ["NavalMastery", "Veteran"], "Admiral", "海军军令部总长"),
              p("近卫文麿", "近卫", "文麿", "重臣·前首相", 50, 56, 78, 76, 82, ["Diplomatic", "Charismatic", "Scholar"], "Diplomat", "藤原摄关家公卿重臣"),
              p("铃木贯太郎", "铃木", "贯太郎", "枢密院议长", 64, 80, 82, 84, 84, ["NavalMastery", "Patient", "Dovish"], "Treasurer", "宫中重臣·终战派元老"),
          ],
          families: [
              f("", "日本皇室", 94, 88, ruling: true),
              f("东条", "陆军统制派", 88, 62),
              f("山本", "海军舰队派", 84, 74),
              f("近卫", "宫中重臣与公卿", 74, 84),
              f("三菱", "三菱重工财阀", 78, 76),
              f("三井", "三井物产财阀", 74, 74),
          ],
          parties: [pt("大政翼赞会", 100)],
          power: pw(ind: 3.85, mp: 1.55, mil: 6, eco: 6, sta: 5, nav: 6, fleets: 6, ships: 12, navBonus: 0.55,
                    traits: ["FieldCombatElite", "WellTrained", "Conqueror", "SiegeCapture", "FightToTheEnd"],
                    lifetime: true, term: 40, nukes: 0, nucProg: 0.0, reactors: 0, warSupport: 94, startArmies: 14, maxArmies: 24),
          familyRelations: [
              fr("东条", "山本", -48),
              fr("东条", "近卫", -26),
              fr("山本", "近卫", 32),
              fr("三菱", "三井", -22),
          ],
          fixedEraName: "昭和"
        ),
        // 3 伪满洲国·关东军（溥仪为名义傀儡皇帝，梅津美治郎任关东军司令实际掌权，开局为日本附庸）
        n(3,
          founder: p("爱新觉罗·溥仪", "爱新觉罗", "溥仪", "傀儡皇帝", 35, 42, 54, 60, 56, ["Dovish", "Paranoid"], "Ruler", "长春名义元首"),
          successors: [
              p("爱新觉罗·溥杰", "爱新觉罗", "溥杰", "皇弟", 34, 56, 62, 66, 64, ["Patient", "Dovish"], "Successor", "长春宗室"),
          ],
          notables: [
              p("梅津美治郎", "梅津", "美治郎", "关东军总司令", 59, 84, 82, 68, 76, ["IronFist", "Administrator", "Veteran"], "Chancellor", "实际掌权关东军总司令"),
              p("喜多诚一", "喜多", "诚一", "方面军司令", 55, 82, 74, 64, 74, ["BattleHardened", "Veteran"], "WarCommander", "东北驻屯主力司令"),
              p("张景惠", "张", "景惠", "国务总理大臣", 64, 54, 66, 64, 60, ["Patient", "Dovish"], "Treasurer", "伪满国务院总理"),
          ],
          families: [
              f("爱新觉罗", "长春伪宫宗室", 64, 80, ruling: true),
              f("梅津", "关东军司令部", 88, 42),
              f("松冈", "满铁重工财团", 76, 66),
          ],
          parties: [pt("满洲国协和会", 100)],
          power: pw(ind: 1.65, mp: 1.15, mil: 5, eco: 4, sta: 3, nav: 2, fleets: 0, ships: 2, navBonus: 0.05,
                    traits: ["WellTrained", "CoreDefense"], lifetime: true, term: 40, nukes: 0, nucProg: 0.0, reactors: 0, warSupport: 64, startArmies: 6, maxArmies: 11),
          familyRelations: [fr("爱新觉罗", "梅津", -35)]
        ),
        // 4 苏联远东（史实司令阿帕纳先科，消除地名姓氏）
        n(4,
          founder: p("约瑟夫·阿帕纳先科", "阿帕纳先科", "约瑟夫", "远东方面军司令·大将", 51, 88, 78, 70, 84, ["BattleHardened", "IronFist", "Veteran"], "Ruler", "苏联远东司令"),
          successors: [
              p("亚历山大·华西列夫斯基", "华西列夫斯基", "亚历山大", "远东苏军总司令·元帅", 46, 94, 90, 78, 88, ["Genius", "Strategist", "BattleHardened"], "Successor", "八月风暴总司令"),
              p("罗季翁·马利诺夫斯基", "马利诺夫斯基", "罗季翁", "后贝加尔方面军司令", 43, 92, 80, 74, 86, ["BattleHardened", "Conqueror", "Tactician"], "Successor", "远东装甲名帅"),
          ],
          notables: [
              p("基里尔·梅列茨科夫", "梅列茨科夫", "基里尔", "远东第一方面军司令", 44, 90, 80, 72, 84, ["Strategist", "BattleHardened"], "WarCommander", "苏军元帅"),
              p("伊万·尤马舍夫", "尤马舍夫", "伊万", "太平洋舰队司令", 46, 86, 78, 72, 82, ["NavalMastery", "Brave"], "Admiral", "海参崴太平洋舰队统帅"),
          ],
          families: [
              f("阿帕纳先科", "远东特别红旗集团军", 88, 80, ruling: true),
              f("尤马舍夫", "太平洋舰队司令部", 74, 78),
          ],
          parties: [pt("苏联共产党", 100)],
          power: pw(ind: 1.45, mp: 1.40, mil: 5, eco: 4, sta: 5, nav: 3, fleets: 2, ships: 5, navBonus: 0.16,
                    traits: ["HomelandDefense", "FieldCombatElite", "CoreDefense"], lifetime: true, term: 40, nukes: 0, nucProg: 0.0, reactors: 0, warSupport: 86, startArmies: 7, maxArmies: 14)
        ),
        // 5 英属缅甸与马来
        n(5,
          founder: p("阿奇博尔德·韦维尔", "韦维尔", "阿奇博尔德", "印度及远东总司令·元帅", 58, 82, 82, 82, 80, ["Veteran", "Patient", "Scholar"], "Ruler", "英属远东总司令"),
          successors: [
              p("威廉·斯利姆", "斯利姆", "威廉", "第14集团军司令·元帅", 50, 93, 86, 80, 92, ["Genius", "Tactician", "BattleHardened", "Beloved"], "Successor", "缅甸反攻奇迹名帅"),
          ],
          notables: [
              p("威廉·斯利姆", "斯利姆", "威廉", "缅甸军团司令", 50, 93, 86, 80, 92, ["Genius", "Tactician", "BattleHardened", "Beloved"], "WarCommander", "英帕尔与科希马胜帅"),
              p("路易斯·蒙巴顿", "蒙巴顿", "路易斯", "东南亚盟军最高司令", 41, 86, 82, 86, 90, ["NavalMastery", "Charismatic", "Diplomatic"], "Admiral", "英国远东舰队统帅"),
          ],
          families: [
              f("温莎", "英属印度与远东总督府", 82, 80, ruling: true),
              f("斯利姆", "英印第十四集团军", 74, 78),
          ],
          parties: [pt("殖民总督府", 62), pt("缅甸自由同盟", 38)],
          power: pw(ind: 1.45, mp: 1.25, mil: 4, eco: 4, sta: 4, nav: 5, fleets: 3, ships: 6, navBonus: 0.28,
                    traits: ["WellTrained", "HomelandDefense"], lifetime: true, term: 40, warSupport: 74)
        ),
        // 6 法属印度支那
        n(6,
          founder: p("让·德古", "德古", "让", "印度支那总督·海军上将", 57, 72, 78, 76, 72, ["NavalMastery", "Patient", "Administrator"], "Ruler", "法属印支总督"),
          successors: [
              p("菲利普·勒克莱尔", "勒克莱尔", "菲利普", "远东法军司令·元帅", 39, 90, 78, 76, 88, ["Brave", "BattleHardened", "Tactician"], "Successor", "自由法国名帅"),
          ],
          notables: [
              p("欧仁·莫尔当", "莫尔当", "欧仁", "印支驻军司令", 56, 76, 74, 70, 72, ["Veteran", "Patient"], "WarCommander", "河内驻军总指挥"),
              p("胡志明", "阮", "胡志明", "越盟领袖", 51, 82, 88, 90, 94, ["Visionary", "Charismatic", "Patient", "NaturalLeader"], "Diplomat", "越南民族独立领袖"),
          ],
          families: [
              f("德古", "河内殖民总督府", 78, 80, ruling: true),
              f("阮", "顺化阮氏王室", 64, 62),
          ],
          parties: [pt("维希总督府", 58), pt("越南独立同盟", 42)],
          power: pw(ind: 0.90, mp: 0.95, mil: 3, eco: 3, sta: 3, nav: 3, fleets: 1, ships: 4, navBonus: 0.12,
                    traits: ["CoreDefense", "HomelandDefense"], lifetime: true, term: 40, warSupport: 54)
        ),
        // 7 美属菲律宾
        n(7,
          founder: p("道格拉斯·麦克阿瑟", "麦克阿瑟", "道格拉斯", "美国远东陆军总司令·五星上将", 61, 94, 86, 84, 94, ["Strategist", "Charismatic", "NavalMastery", "Conqueror", "NaturalLeader"], "Ruler", "西南太平洋盟军总司令"),
          successors: [
              p("曼努埃尔·奎松", "奎松", "曼努埃尔", "菲律宾自治邦总统", 62, 66, 86, 88, 88, ["Diplomatic", "Charismatic", "Beloved"], "Successor", "菲律宾国父"),
              p("切斯特·尼米兹", "尼米兹", "切斯特", "太平洋舰队总司令·五星上将", 56, 97, 90, 84, 92, ["Genius", "NavalMastery", "ShipMaster", "Strategist", "Patient"], "Successor", "中途岛与太平洋胜帅"),
          ],
          notables: [
              p("切斯特·尼米兹", "尼米兹", "切斯特", "太平洋舰队总司令", 56, 97, 90, 84, 92, ["Genius", "NavalMastery", "ShipMaster", "Strategist", "Patient"], "Admiral", "美国太平洋舰队灵魂"),
              p("威廉·哈尔西", "哈尔西", "威廉", "第三舰队司令·五星上将", 59, 92, 74, 70, 90, ["Brave", "NavalMastery", "Hawkish"], "Admiral", "公牛哈尔西"),
              p("雷蒙德·斯普鲁恩斯", "斯普鲁恩斯", "雷蒙德", "第五舰队司令", 55, 95, 86, 78, 86, ["Genius", "NavalMastery", "Tactician", "Patient"], "Admiral", "中途岛与菲律宾海奇迹胜帅"),
              p("乔纳森·温莱特", "温莱特", "乔纳森", "巴丹防卫司令", 58, 86, 74, 70, 84, ["Brave", "Stubborn", "Veteran"], "WarCommander", "科雷希多守将"),
          ],
          families: [
              f("麦克阿瑟", "太平洋盟军司令部", 88, 80, ruling: true),
              f("奎松", "马尼拉国民党世家", 74, 80),
          ],
          parties: [pt("远东盟军司令部", 58), pt("菲律宾国民党", 42)],
          power: pw(ind: 2.40, mp: 1.25, mil: 5, eco: 6, sta: 5, nav: 6, fleets: 5, ships: 10, navBonus: 0.44,
                    traits: ["WellTrained", "StrengthenCore", "FieldCombatElite"],
                    lifetime: true, term: 40, nukes: 0, nucProg: 0.0, reactors: 0, warSupport: 88)
        ),
        // 8 泰国
        n(8,
          founder: p("銮披汶·颂堪", "颂堪", "銮披汶", "总理·陆军元帅", 44, 78, 80, 82, 80, ["Ambitious", "Diplomatic", "IronFist"], "Ruler", "泰国战时总理"),
          successors: [
              p("比里·帕侬荣", "帕侬荣", "比里", "摄政王·总理", 41, 66, 86, 88, 84, ["Reformer", "MasterDiplomat", "Scholar"], "Successor", "自由泰运动领袖"),
          ],
          notables: [
              p("比里·帕侬荣", "帕侬荣", "比里", "财政部长·摄政", 41, 66, 86, 88, 84, ["Financier", "MasterDiplomat", "Reformer"], "Chancellor", "泰国宪政改革家"),
              p("屏·春哈旺", "春哈旺", "屏", "陆军上将", 50, 80, 74, 68, 76, ["Veteran", "BattleHardened"], "WarCommander", "泰军北方战区司令"),
          ],
          families: [
              f("查克里", "曼谷王室", 84, 80, ruling: true),
              f("春哈旺", "泰国军政世家", 72, 74),
          ],
          parties: [pt("人民党军人派", 62), pt("自由泰派", 38)],
          power: pw(ind: 0.95, mp: 0.95, mil: 3, eco: 3, sta: 4, nav: 2, fleets: 1, ships: 4, navBonus: 0.10,
                    traits: ["CoreDefense", "HomelandDefense"], lifetime: true, term: 40, warSupport: 64)
        ),
        // 9 英属马来与新加坡
        n(9,
          founder: p("亚瑟·帕西瓦尔", "帕西瓦尔", "亚瑟", "马来亚总司令·中将", 54, 74, 78, 74, 76, ["Patient", "Veteran"], "Ruler", "新加坡要塞司令"),
          successors: [p("托马斯·菲利普斯", "菲利普斯", "托马斯", "Z舰队司令·上将", 53, 84, 76, 72, 82, ["NavalMastery", "Brave"], "Successor", "远东舰队司令")],
          notables: [p("托马斯·菲利普斯", "菲利普斯", "托马斯", "Z舰队司令", 53, 84, 76, 72, 82, ["NavalMastery", "Brave"], "Admiral", "威尔士亲王号司令")],
          families: [f("帕西瓦尔", "新加坡远东司令部", 78, 80, ruling: true)],
          parties: [pt("海峡殖民地总督府", 100)],
          power: pw(ind: 1.15, mp: 0.85, mil: 4, eco: 5, sta: 4, nav: 5, fleets: 2, ships: 6, navBonus: 0.28,
                    traits: ["CoreDefense"], lifetime: true, term: 40, warSupport: 72)
        ),
        // 10 荷属东印度
        n(10,
          founder: p("海因·特·波尔滕", "波尔滕", "海因", "荷印陆军总司令", 56, 78, 78, 76, 78, ["Brave", "Veteran"], "Ruler", "巴达维亚守将"),
          successors: [p("康拉德·赫尔弗里希", "赫尔弗里希", "康拉德", "海军中将", 55, 86, 78, 74, 82, ["NavalMastery", "Tactician"], "Successor", "荷印海军司令")],
          notables: [p("卡雷尔·多尔曼", "多尔曼", "卡雷尔", "联合舰队司令", 52, 88, 74, 72, 86, ["NavalMastery", "Brave"], "Admiral", "爪哇海海战名将")],
          families: [f("奥兰治-拿骚", "荷属东印度总督府", 80, 82, ruling: true)],
          parties: [pt("巴达维亚总督府", 100)],
          power: pw(ind: 1.25, mp: 1.10, mil: 3, eco: 5, sta: 4, nav: 4, fleets: 2, ships: 5, navBonus: 0.22,
                    traits: ["CoreDefense"], lifetime: true, term: 40, warSupport: 70)
        ),
        // 11 蒙古人民共和国
        n(11,
          founder: p("霍尔洛·乔巴山", "乔巴山", "霍尔洛", "蒙古元帅", 46, 84, 78, 76, 82, ["IronFist", "BattleHardened"], "Ruler", "蒙古人民军最高统帅"),
          successors: [p("尤睦佳·泽登巴尔", "泽登巴尔", "尤睦佳", "总书记", 25, 68, 82, 78, 76, ["Administrator"], "Successor", "接班人")],
          notables: [p("朱姆林·勒哈格瓦苏伦", "勒哈格瓦苏伦", "朱姆林", "骑兵军长", 29, 86, 76, 70, 82, ["Brave", "Tactician"], "WarCommander", "诺门罕骑兵英雄")],
          families: [f("乔巴山", "蒙古人民革命党", 84, 84, ruling: true)],
          parties: [pt("蒙古人民革命党", 100)],
          power: pw(ind: 0.50, mp: 0.78, mil: 3, eco: 3, sta: 4, nav: 1, fleets: 0, ships: 0, navBonus: 0.0,
                    traits: ["CavalryTradition", "HomelandDefense"], lifetime: true, term: 40, warSupport: 84)
        ),
        // 12 美军太平洋舰队
        n(12,
          founder: p("切斯特·尼米兹", "尼米兹", "切斯特", "太平洋舰队总司令·五星上将", 56, 97, 90, 84, 92, ["Genius", "NavalMastery", "ShipMaster", "Strategist"], "Ruler", "太平洋战场总司令"),
          successors: [p("雷蒙德·斯普鲁恩斯", "斯普鲁恩斯", "雷蒙德", "第五舰队司令", 55, 96, 86, 78, 88, ["Genius", "NavalMastery", "Tactician"], "Successor", "中途岛胜帅")],
          notables: [
              p("雷蒙德·斯普鲁恩斯", "斯普鲁恩斯", "雷蒙德", "航母特混舰队司令", 55, 96, 86, 78, 88, ["Genius", "NavalMastery", "Tactician"], "Admiral", "中途岛奇迹指挥官"),
              p("威廉·哈尔西", "哈尔西", "威廉", "第三舰队司令", 59, 93, 76, 72, 92, ["Brave", "NavalMastery", "Hawkish"], "Admiral", "公牛哈尔西"),
          ],
          families: [f("尼米兹", "美军太平洋司令部", 90, 86, ruling: true)],
          parties: [pt("美军太平洋战区司令部", 100)],
          power: pw(ind: 3.60, mp: 1.45, mil: 6, eco: 6, sta: 6, nav: 6, fleets: 6, ships: 12, navBonus: 0.52,
                    traits: ["WellTrained", "FieldCombatElite", "StrengthenCore"], lifetime: true, term: 40, nukes: 0, nucProg: 0.0, reactors: 0, warSupport: 94)
        ),
    ]

    // MARK: - 剧本 10：冷战铁幕 · 两极对峙（公元 1950 年，12 国 · 核时代全面激活）

    private static let coldwar1950: [HistoricalNationRoster] = [
        // 0 美国
        n(0,
          founder: p("哈里·杜鲁门", "杜鲁门", "哈里", "美利坚合众国总统", 58, 78, 88, 86, 84, ["Stubborn", "Just", "Administrator", "Visionary"], "Ruler", "第33任美国总统"),
          successors: [
              p("德怀特·艾森豪威尔", "艾森豪威尔", "德怀特", "美国总统·五星上将", 59, 95, 90, 90, 94, ["Genius", "Strategist", "MasterDiplomat", "NaturalLeader", "Beloved"], "Successor", "第34任总统·欧洲盟军统帅"),
              p("约翰·肯尼迪", "肯尼迪", "约翰", "美国总统", 33, 76, 86, 90, 96, ["Charismatic", "Visionary", "Brave", "Beloved"], "Successor", "第35任总统"),
              p("林登·约翰逊", "约翰逊", "林登", "美国总统", 42, 72, 90, 82, 82, ["Administrator", "Lawgiver", "IronFist"], "Successor", "第36任总统"),
              p("理查德·尼克松", "尼克松", "理查德", "美国总统", 37, 74, 86, 94, 80, ["MasterDiplomat", "Strategist", "Ambitious"], "Successor", "第37任总统·破冰外交"),
          ],
          notables: [
              p("德怀特·艾森豪威尔", "艾森豪威尔", "德怀特", "北约最高司令·五星上将", 59, 95, 90, 90, 94, ["Genius", "Strategist", "MasterDiplomat", "NaturalLeader"], "WarCommander", "北约首任最高司令"),
              p("道格拉斯·麦克阿瑟", "麦克阿瑟", "道格拉斯", "联合国军总司令", 64, 93, 82, 78, 92, ["Strategist", "Charismatic", "Hawkish"], "WarCommander", "远东战区五星上将"),
              p("马修·李奇微", "李奇微", "马修", "第8集团军司令", 55, 92, 82, 76, 86, ["Tactician", "BattleHardened", "Veteran"], "WarCommander", "铁腕实战名将"),
              p("切斯特·尼米兹", "尼米兹", "切斯特", "海军五星上将", 64, 96, 88, 84, 90, ["NavalMastery", "ShipMaster", "Strategist"], "Admiral", "太平洋海权统帅"),
              p("乔治·马歇尔", "马歇尔", "乔治", "国防部长·国务卿", 64, 90, 96, 95, 92, ["Genius", "MasterDiplomat", "Administrator", "Just"], "Chancellor", "马歇尔计划缔造者"),
          ],
          families: [
              f("肯尼迪", "波士顿政治世家", 78, 76, ruling: true),
              f("洛克菲勒", "华尔街工业金融财团", 82, 80),
              f("杜勒斯", "华盛顿外交战略世家", 74, 78),
          ],
          parties: [pt("民主党", 54), pt("共和党", 46)],
          power: pw(ind: 4.00, mp: 1.90, mil: 6, eco: 6, sta: 6, nav: 6, fleets: 6, ships: 12, navBonus: 0.48,
                    traits: ["WellTrained", "StrengthenCore", "ManifestDestiny", "FieldCombatElite"],
                    lifetime: false, term: 4, nukes: 4, nucProg: 40.0, reactors: 3, warSupport: 80, startArmies: 14, maxArmies: 28)
        ),
        // 1 苏联
        n(1,
          founder: p("约瑟夫·斯大林", "朱加什维利", "约瑟夫", "苏联部长会议主席·大元帅", 60, 86, 92, 86, 90, ["IronFist", "Stubborn", "Administrator", "Visionary"], "Ruler", "苏联最高领导人"),
          successors: [
              p("尼基塔·赫鲁晓夫", "赫鲁晓夫", "尼基塔", "苏共中央第一书记", 56, 78, 84, 82, 84, ["Reformer", "Ambitious", "Hawkish"], "Successor", "苏联改革派领袖"),
              p("列昂尼德·勃列日涅夫", "勃列日涅夫", "列昂尼德", "苏共中央总书记", 43, 78, 82, 82, 84, ["Patient", "Veteran", "Hawkish"], "Successor", "冷战军力鼎盛期领袖"),
              p("尤里·安德罗波夫", "安德罗波夫", "尤里", "苏共中央总书记", 36, 76, 90, 86, 80, ["IronFist", "Administrator", "Diligent"], "Successor", "整肃改革领袖"),
              p("米哈伊尔·戈尔巴乔夫", "戈尔巴乔夫", "米哈伊尔", "苏联总统", 24, 62, 78, 88, 86, ["Reformer", "Dovish", "Diplomatic"], "Successor", "新思维改革者"),
          ],
          notables: [
              p("格奥尔基·朱可夫", "朱可夫", "格奥尔基", "苏联元帅", 53, 97, 82, 74, 92, ["Genius", "BattleHardened", "Strategist", "IronFist"], "WarCommander", "苏联国防部支柱"),
              p("亚历山大·华西列夫斯基", "华西列夫斯基", "亚历山大", "国防部长·苏联元帅", 54, 94, 90, 80, 86, ["Genius", "Strategist", "Administrator"], "WarCommander", "苏联国防部长"),
              p("维亚切斯拉夫·莫洛托夫", "莫洛托夫", "维亚切斯拉夫", "第一副总理", 60, 62, 88, 90, 80, ["MasterDiplomat", "Stubborn", "Administrator"], "Chancellor", "苏联外交铁腕"),
              p("谢尔盖·戈尔什科夫", "戈尔什科夫", "谢尔盖", "海军元帅", 40, 92, 86, 76, 86, ["NavalMastery", "ShipMaster", "Visionary"], "Admiral", "苏联远洋红海军之父"),
          ],
          families: [
              f("朱加什维利", "苏共中央政治局", 92, 80, ruling: true),
              f("朱可夫", "苏军总参谋部", 80, 78),
              f("库尔恰托夫", "苏联核科研与军工系", 76, 82),
          ],
          parties: [pt("苏联共产党", 100)],
          power: pw(ind: 2.85, mp: 2.10, mil: 6, eco: 5, sta: 5, nav: 5, fleets: 4, ships: 8, navBonus: 0.28,
                    traits: ["HomelandDefense", "FightToTheEnd", "WellTrained", "Conqueror"],
                    lifetime: true, term: 40, nukes: 2, nucProg: 30.0, reactors: 2, warSupport: 86, startArmies: 16, maxArmies: 30)
        ),
        // 2 中华人民共和国
        n(2,
          founder: p("毛泽东", "毛", "泽东", "中央人民政府主席", 56, 97, 95, 92, 98, ["Genius", "Strategist", "Visionary", "Unifier", "Beloved"], "Ruler", "新中国开国领袖"),
          successors: [
              p("周恩来", "周", "恩来", "国务院总理", 52, 84, 98, 99, 96, ["Genius", "MasterDiplomat", "Administrator", "Diligent", "Beloved"], "Successor", "开国总理"),
              p("邓小平", "邓", "小平", "中央军委主席·总设计师", 46, 90, 98, 94, 94, ["Genius", "Reformer", "Visionary", "IronFist"], "Successor", "改革开放总设计师"),
          ],
          notables: [
              p("彭德怀", "彭", "德怀", "志愿军司令员兼政委", 52, 97, 82, 74, 92, ["Brave", "BattleHardened", "Tactician", "IronFist", "NaturalLeader"], "WarCommander", "横刀立马·彭大将军"),
              p("朱德", "朱", "德", "人民解放军总司令", 63, 94, 84, 82, 94, ["Veteran", "BattleHardened", "Benevolent"], "WarCommander", "开国元帅之首"),
              p("林彪", "林", "彪", "中南军区司令员", 42, 96, 80, 72, 84, ["Genius", "Strategist", "Tactician"], "WarCommander", "辽沈平津统帅"),
              p("粟裕", "粟", "裕", "华东野战军名将", 43, 97, 84, 76, 88, ["Genius", "Tactician", "BattleHardened"], "WarCommander", "淮海战役主帅"),
              p("刘伯承", "刘", "伯承", "西南军政委员会主席", 57, 95, 86, 78, 88, ["Strategist", "Scholar", "Tactician"], "WarCommander", "军事学院创建者"),
              p("周恩来", "周", "恩来", "政务院总理兼外交部长", 52, 84, 98, 99, 96, ["Genius", "MasterDiplomat", "Administrator", "Diligent"], "Chancellor", "日内瓦与万隆外交传奇"),
              p("肖劲光", "肖", "劲光", "海军司令员·大将", 47, 88, 84, 78, 84, ["NavalMastery", "Visionary", "Administrator"], "Admiral", "人民海军首任司令员"),
          ],
          families: [
              f("毛", "中央人民政府政务院", 92, 85, ruling: true),
              f("朱", "人民解放军将帅系", 84, 88),
              f("周", "外交与经济建设系", 78, 86),
          ],
          parties: [pt("中国共产党", 100)],
          power: pw(ind: 1.45, mp: 2.35, mil: 4, eco: 3, sta: 6, nav: 2, fleets: 1, ships: 4, navBonus: 0.10,
                    traits: ["FightToTheEnd", "FieldCombatElite", "HomelandDefense", "DefyTheStrong"],
                    lifetime: true, term: 40, nukes: 0, nucProg: 0.0, reactors: 0, warSupport: 94, startArmies: 13, maxArmies: 24)
        ),
        // 3 英国（双首脑：乔治六世为国王，克莱门特·艾德礼任首相；1950年飓风计划研发中，尚未拥核）
        n(3,
          founder: p("乔治六世", "温莎", "乔治", "英国国王", 54, 70, 82, 86, 90, ["Brave", "Just", "Beloved"], "Ruler", "温莎王朝国王"),
          successors: [
              p("伊丽莎白二世", "温莎", "伊丽莎白", "英国女王", 24, 68, 86, 90, 92, ["Patient", "Just", "Beloved"], "Successor", "女王", gender: 1),
          ],
          notables: [
              p("克莱门特·艾德礼", "艾德礼", "克莱门特", "英国首相", 64, 68, 90, 86, 82, ["Administrator", "Reformer", "Patient", "Just"], "Chancellor", "战后福利国首相"),
              p("伯纳德·蒙哥马利", "蒙哥马利", "伯纳德", "北约副最高司令·元帅", 62, 93, 82, 72, 88, ["Strategist", "BattleHardened", "Veteran"], "WarCommander", "阿拉曼元帅"),
              p("布鲁斯·弗雷泽", "弗雷泽", "布鲁斯", "第一海务大臣·元帅", 62, 92, 84, 78, 86, ["NavalMastery", "ShipMaster", "Veteran"], "Admiral", "皇家海军元帅"),
              p("欧内斯特·贝文", "贝文", "欧内斯特", "外交大臣", 64, 60, 88, 90, 84, ["MasterDiplomat", "Stubborn", "Administrator"], "Diplomat", "北约共同缔造者"),
          ],
          families: [
              f("温莎", "温莎王室", 88, 85, ruling: true),
              f("艾德礼", "工党执政内阁", 80, 80),
              f("丘吉尔", "保守党贵族世家", 74, 74),
          ],
          parties: [pt("工党", 50), pt("保守党", 44), pt("自由党", 6)],
          power: pw(ind: 2.75, mp: 1.35, mil: 5, eco: 6, sta: 6, nav: 6, fleets: 5, ships: 9, navBonus: 0.42,
                    traits: ["WellTrained", "StrengthenCore", "HomelandDefense"],
                    lifetime: true, term: 40, nukes: 0, nucProg: 42.0, reactors: 1, warSupport: 74)
        ),
        // 4 法国
        n(4,
          founder: p("樊尚·奥里奥尔", "奥里奥尔", "樊尚", "法兰西第四共和国总统", 63, 62, 84, 84, 80, ["Patient", "Diplomatic", "Lawgiver"], "Ruler", "第四共和国首任总统"),
          successors: [
              p("夏尔·戴高乐", "戴高乐", "夏尔", "第五共和国总统", 59, 91, 90, 94, 95, ["Visionary", "Stubborn", "MasterDiplomat", "NaturalLeader"], "Successor", "法兰西独立核威慑缔造者"),
              p("乔治·蓬皮杜", "蓬皮杜", "乔治", "法国总统", 39, 60, 90, 86, 84, ["Financier", "Administrator", "Scholar"], "Successor", "辉煌三十年总统"),
          ],
          notables: [
              p("让·德·拉特尔·德·塔西尼", "塔西尼", "让", "法国元帅", 61, 91, 80, 76, 88, ["Brave", "BattleHardened", "Tactician"], "WarCommander", "第一集团军名帅"),
              p("罗伯特·舒曼", "舒曼", "罗伯特", "外交部长", 63, 56, 88, 94, 84, ["Visionary", "MasterDiplomat", "Reformer"], "Diplomat", "欧洲一体化之父"),
              p("亨利·诺米", "诺米", "亨利", "海军上将", 50, 86, 80, 74, 80, ["NavalMastery", "ShipMaster"], "Admiral", "战后法国海军重建者"),
          ],
          families: [
              f("戴高乐", "戴高乐主义政治系", 80, 74, ruling: true),
              f("舒曼", "欧陆煤钢同盟派", 74, 78),
          ],
          parties: [pt("工人国际法国支部", 28), pt("人民共和运动", 26), pt("戴高乐联盟", 26), pt("法国共产党", 20)],
          power: pw(ind: 2.35, mp: 1.30, mil: 5, eco: 5, sta: 5, nav: 5, fleets: 4, ships: 7, navBonus: 0.28,
                    traits: ["WellTrained", "CoreDefense"],
                    lifetime: false, term: 5, nukes: 0, nucProg: 0.0, reactors: 0, warSupport: 70)
        ),
        // 5 西欧北约
        n(5,
          founder: p("康拉德·阿登纳", "阿登纳", "康拉德", "联邦德国总理", 64, 66, 94, 94, 88, ["Administrator", "MasterDiplomat", "Visionary", "Patient"], "Ruler", "西德复兴之父"),
          successors: [
              p("维利·勃兰特", "勃兰特", "维利", "联邦总理", 36, 64, 88, 94, 90, ["MasterDiplomat", "Reformer", "Benevolent", "Beloved"], "Successor", "新东方政策领袖"),
              p("赫尔穆特·施密特", "施密特", "赫尔穆特", "联邦总理", 32, 74, 92, 88, 86, ["Financier", "Administrator", "Strategist"], "Successor", "务实强人总理"),
          ],
          notables: [
              p("路德维希·艾哈德", "艾哈德", "路德维希", "经济部长·副总理", 53, 56, 96, 84, 84, ["Genius", "Financier", "Reformer", "Administrator"], "Treasurer", "莱茵河经济奇迹之父"),
              p("阿道夫·豪辛格", "豪辛格", "阿道夫", "联邦国防军总监", 53, 88, 84, 76, 80, ["Strategist", "Veteran"], "WarCommander", "北约军事委员会主席"),
              p("阿尔奇德·德·加斯佩里", "加斯佩里", "阿尔奇德", "意大利总理", 64, 58, 88, 90, 84, ["Diplomatic", "Administrator", "Just"], "Chancellor", "欧盟奠基人之一"),
          ],
          families: [
              f("阿登纳", "莱茵基督教民主派", 84, 80, ruling: true),
              f("西门子", "西欧精密工业财团", 78, 80),
          ],
          parties: [pt("基督教民主联盟", 46), pt("德国社会民主党", 36), pt("西欧自由联盟", 18)],
          power: pw(ind: 2.80, mp: 1.50, mil: 5, eco: 6, sta: 6, nav: 4, fleets: 3, ships: 6, navBonus: 0.22,
                    traits: ["WellTrained", "StrengthenCore", "CoreDefense"],
                    lifetime: false, term: 4, nukes: 0, nucProg: 0.0, reactors: 0, warSupport: 68)
        ),
        // 6 东欧华约
        n(6,
          founder: p("博莱斯瓦夫·贝鲁特", "贝鲁特", "博莱斯瓦夫", "波兰总统·党魁", 58, 70, 82, 76, 76, ["IronFist", "Administrator", "Diligent"], "Ruler", "东欧华约核心领导人"),
          successors: [
              p("瓦迪斯瓦夫·哥穆尔卡", "哥穆尔卡", "瓦迪斯瓦夫", "统一工人党第一书记", 45, 72, 84, 78, 80, ["Stubborn", "Reformer", "Patient"], "Successor", "波兰十月改革领袖"),
              p("瓦尔特·乌布利希", "乌布利希", "瓦尔特", "统一社会党第一书记", 57, 74, 84, 74, 74, ["IronFist", "Administrator"], "Successor", "东德建国领导人"),
          ],
          notables: [
              p("康斯坦丁·罗科索夫斯基", "罗科索夫斯基", "康斯坦丁", "波兰国防部长·元帅", 53, 95, 82, 76, 90, ["Genius", "Tactician", "BattleHardened"], "WarCommander", "双国元帅"),
              p("海因茨·霍夫曼", "霍夫曼", "海因茨", "东德人民军大将", 40, 84, 78, 70, 78, ["Veteran", "BattleHardened"], "WarCommander", "华约精锐陆军统帅"),
          ],
          families: [
              f("贝鲁特", "华约联合司令部", 86, 80, ruling: true),
              f("乌布利希", "东欧工业计划系", 76, 78),
          ],
          parties: [pt("波兰统一工人党", 40), pt("德国统一社会党", 36), pt("捷克斯洛伐克共产党", 24)],
          power: pw(ind: 1.95, mp: 1.55, mil: 5, eco: 4, sta: 4, nav: 3, fleets: 2, ships: 4, navBonus: 0.12,
                    traits: ["WellTrained", "CoreDefense"], lifetime: true, term: 40, warSupport: 72)
        ),
        // 7 印度
        n(7,
          founder: p("贾瓦哈拉尔·尼赫鲁", "尼赫鲁", "贾瓦哈拉尔", "印度首任总理", 60, 68, 88, 92, 92, ["Scholar", "Visionary", "MasterDiplomat", "Reformer", "Beloved"], "Ruler", "不结盟运动发起人"),
          successors: [
              p("拉尔·夏斯特里", "夏斯特里", "拉尔", "印度总理", 46, 74, 84, 82, 84, ["Just", "Patient", "Benevolent"], "Successor", "第二任总理"),
              p("英迪拉·甘地", "尼赫鲁-甘地", "英迪拉", "印度总理", 32, 80, 88, 86, 90, ["IronFist", "Ambitious", "Charismatic", "Hawkish"], "Successor", "印度铁娘子", gender: 1),
          ],
          notables: [
              p("萨达尔·帕特尔", "帕特尔", "瓦拉巴伊", "副总理·内政部长", 64, 76, 94, 86, 88, ["IronFist", "Unifier", "Administrator"], "Chancellor", "印度铁人·土邦整合者"),
              p("科丹德拉·卡里亚帕", "卡里亚帕", "科丹德拉", "陆军总司令·元帅", 51, 86, 80, 74, 84, ["Veteran", "BattleHardened", "Just"], "WarCommander", "印度首位本土陆军总司令"),
              p("拉姆·卡塔里", "卡塔里", "拉姆", "海军中将", 39, 82, 76, 74, 78, ["NavalMastery", "ShipMaster"], "Admiral", "印度海军建设者"),
          ],
          families: [
              f("尼赫鲁", "尼赫鲁-甘地政治世家", 88, 80, ruling: true),
              f("塔塔", "孟买工业财团", 76, 78),
          ],
          parties: [pt("印度国民大会党", 72), pt("印度社会党", 16), pt("印度共产党", 12)],
          power: pw(ind: 1.55, mp: 2.10, mil: 4, eco: 4, sta: 5, nav: 3, fleets: 2, ships: 5, navBonus: 0.16,
                    traits: ["HomelandDefense", "StrengthenCore"],
                    lifetime: false, term: 5, nukes: 0, nucProg: 0.0, reactors: 0, warSupport: 72)
        ),
        // 8 日本（双首脑：昭和天皇裕仁为象征元首，吉田茂任内阁总理大臣）
        n(8,
          founder: p("裕仁", "", "裕仁", "天皇", 49, 64, 78, 82, 84, ["Patient", "Dovish", "Just"], "Ruler", "昭和天皇（日本皇室无姓氏）"),
          successors: [
              p("明仁", "", "明仁", "皇太子", 18, 56, 80, 86, 86, ["Benevolent", "Dovish", "Beloved"], "Successor", "皇太子"),
          ],
          notables: [
              p("吉田茂", "吉田", "茂", "内阁总理大臣", 64, 58, 92, 92, 86, ["MasterDiplomat", "Financier", "Reformer", "Visionary"], "Chancellor", "战后经济复兴总理"),
              p("池田勇人", "池田", "勇人", "大藏大臣", 50, 56, 94, 86, 84, ["Financier", "Administrator", "Visionary"], "Treasurer", "战后财相"),
              p("白洲次郎", "白洲", "次郎", "贸易厅长官", 48, 60, 86, 90, 84, ["MasterDiplomat", "Financier", "Stubborn"], "Diplomat", "吉田茂首席顾问"),
              p("林敬三", "林", "敬三", "警察预备队总总监", 43, 80, 84, 76, 78, ["Administrator", "Just"], "WarCommander", "自卫队奠基人"),
          ],
          families: [
              f("", "日本皇室", 86, 85, ruling: true),
              f("吉田", "保守执政自由党", 84, 82),
              f("丰田", "战后日本制造财团", 78, 80),
          ],
          parties: [pt("自由党", 56), pt("日本社会党", 26), pt("国民民主党", 18)],
          power: pw(ind: 2.50, mp: 1.40, mil: 4, eco: 6, sta: 6, nav: 4, fleets: 2, ships: 5, navBonus: 0.20,
                    traits: ["StrengthenCore", "WellTrained", "CoreDefense"], lifetime: true, term: 40, warSupport: 54),
          fixedEraName: "昭和"
        ),
        // 9 南斯拉夫与中东
        n(9,
          founder: p("约瑟普·布罗兹·铁托", "布罗兹", "约瑟普·铁托", "南斯拉夫总统·元帅", 58, 92, 88, 92, 94, ["Genius", "BattleHardened", "MasterDiplomat", "Unifier", "Charismatic"], "Ruler", "不结盟运动核心领袖"),
          successors: [
              p("贾迈勒·纳赛尔", "纳赛尔", "贾迈勒", "埃及总统", 32, 84, 86, 88, 94, ["Charismatic", "Visionary", "Unifier", "NaturalLeader"], "Successor", "泛阿拉伯民族主义领袖"),
          ],
          notables: [
              p("贾迈勒·纳赛尔", "纳赛尔", "贾迈勒", "自由军官团领袖", 32, 84, 86, 88, 94, ["Charismatic", "Visionary", "NaturalLeader"], "WarCommander", "苏伊士运河国有化英雄"),
              p("爱德华·卡德尔", "卡德尔", "爱德华", "副总理·外交部长", 40, 62, 88, 88, 80, ["Reformer", "Scholar", "Diplomatic"], "Chancellor", "工人自治理论家"),
              p("科恰·波波维奇", "波波维奇", "科恰", "总参谋长·上将", 42, 88, 80, 82, 84, ["BattleHardened", "Tactician", "Diplomatic"], "WarCommander", "南人民军总参谋长"),
          ],
          families: [
              f("布罗兹", "贝尔格莱德联邦派", 84, 80, ruling: true),
              f("纳赛尔", "开罗自由军官团", 76, 76),
          ],
          parties: [pt("南斯拉夫共产主义者联盟", 44), pt("自由军官团", 32), pt("阿拉伯复兴社会党", 24)],
          power: pw(ind: 1.55, mp: 1.45, mil: 4, eco: 4, sta: 5, nav: 3, fleets: 2, ships: 5, navBonus: 0.16,
                    traits: ["HomelandDefense", "FightToTheEnd", "DefyTheStrong"], lifetime: true, term: 40, warSupport: 80)
        ),
        // 10 巴西与拉美
        n(10,
          founder: p("热图利奥·瓦加斯", "瓦加斯", "热图利奥", "巴西总统", 62, 70, 88, 84, 90, ["Reformer", "Charismatic", "Administrator", "Beloved"], "Ruler", "巴西现代工业化之父"),
          successors: [
              p("胡安·庇隆", "庇隆", "胡安", "阿根廷总统·上将", 54, 78, 84, 82, 92, ["Charismatic", "Reformer", "NaturalLeader"], "Successor", "庇隆主义领袖"),
              p("儒塞利诺·库比契克", "库比契克", "儒塞利诺", "巴西总统", 48, 62, 90, 84, 88, ["Visionary", "Financier", "Reformer"], "Successor", "巴西利亚建设者"),
          ],
          notables: [
              p("若昂·马斯卡雷尼亚斯·德·莫赖斯", "莫赖斯", "若昂", "巴西远征军元帅", 62, 86, 78, 74, 84, ["BattleHardened", "Veteran"], "WarCommander", "二战巴西远征军司令"),
              p("胡安·庇隆", "庇隆", "胡安", "拉美联合顾问", 54, 78, 84, 82, 92, ["Charismatic", "Reformer"], "Diplomat", "南锥体强人"),
          ],
          families: [
              f("瓦加斯", "里约工业发展派", 82, 80, ruling: true),
              f("庇隆", "布宜诺斯艾利斯劳工派", 76, 74),
          ],
          parties: [pt("巴西工党", 44), pt("正义党", 32), pt("全国民主联盟", 24)],
          power: pw(ind: 1.60, mp: 1.45, mil: 4, eco: 4, sta: 4, nav: 3, fleets: 2, ships: 5, navBonus: 0.16,
                    traits: ["StrengthenCore", "CoreDefense"], lifetime: false, term: 5, warSupport: 64)
        ),
        // 11 澳大利亚联邦
        n(11,
          founder: p("罗伯特·孟席斯", "孟席斯", "罗伯特", "澳大利亚总理", 55, 66, 90, 88, 86, ["Administrator", "Lawgiver", "Diplomatic", "Patient"], "Ruler", "澳大利亚任期最长总理"),
          successors: [
              p("哈罗德·霍尔特", "霍尔特", "哈罗德", "澳大利亚总理", 42, 62, 84, 84, 82, ["Financier", "Diplomatic"], "Successor", "自由党接班人"),
          ],
          notables: [
              p("托马斯·布莱米", "布莱米", "托马斯", "澳大利亚陆军元帅", 64, 88, 80, 74, 82, ["Veteran", "BattleHardened", "Strategist"], "WarCommander", "澳大利亚首位元帅"),
              p("约翰·柯林斯", "柯林斯", "约翰", "皇家澳大利亚海军中将", 51, 88, 80, 76, 84, ["NavalMastery", "ShipMaster", "Brave"], "Admiral", "悉尼号与太平洋名将"),
          ],
          families: [
              f("孟席斯", "堪培拉自由联盟", 82, 80, ruling: true),
              f("柯林斯", "太平洋英联邦海军系", 72, 78),
          ],
          parties: [pt("澳大利亚自由党", 46), pt("澳大利亚工党", 40), pt("澳大利亚乡村党", 14)],
          power: pw(ind: 1.85, mp: 0.95, mil: 5, eco: 5, sta: 6, nav: 5, fleets: 3, ships: 6, navBonus: 0.28,
                    traits: ["WellTrained", "HomelandDefense", "StrengthenCore"], lifetime: false, term: 4, warSupport: 72)
        ),
    ]
}
