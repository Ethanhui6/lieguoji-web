import Foundation

/// v5.8.0 最高执政自主决策与全系统自动治理引擎（纯 Swift `LieguojiCore`，Linux + iOS 通用，零 UIKit 依赖）：
/// 1. 识别各国真正握有最高抉择权的实权人物及其真实头衔（皇帝、天皇、大汗、国王、征夷大将军、内阁首相、大总统、执政官、教宗、最高统帅、总书记、主席等），读取其四维属性与性格特质，生成八大执政人格原型与动态优先纲领；
/// 2. 提供可扩展的全系统月度/季度自主治理管线（`Subsystem` 注册表）：朝政事件链抉择、多分支朝议法案、州郡五类基建（水利/商埠/要塞/船坞/学院）、四线科技拨款、治国方略与税制/集权调配、26 项国策政令、天下奇观大工程、国家霸业领赏与黄金盛世、战时雇佣兵与四海古迹远征；
/// 3. 将每次关键决断以生动详实的历史朝政奏录形式写入 `r.regimes.aiCourtLog[id]`（单国保留近 24 条），供国家「朝政」页实时回看执政者的治国脉络；
/// 4. 严格依赖月度预索引缓存（`MonthCache` + `Regimes.currentMonthIndex`），单国单月维持摊还 O(1) 级开销，零逐国全图扫描，且仅在 App 规则（`UnitKinds.enabled && r.regimes.enabled`）下生效，绝不干扰网页逐字节黄金对照测试。
public enum SovereignAI {

    // MARK: - 1. 可扩展全系统自动治理子系统注册表

    /// 全系统自主治理管线注册表（未来任何新玩法模块只需新增一个 case 并在 `runSubsystem` 注册即可自动接管运行）。
    public enum Subsystem: String, CaseIterable, Sendable {
        case eventChains       = "eventChains"       // (A1) 16 组多阶段因果事件链抉择
        case courtAgendas      = "courtAgendas"      // (A2) 朝堂/议会多分支政治议案与权力天平调衡
        case provincialInfra   = "provincialInfra"   // (B) 州郡五类基建（水利/商埠/要塞/船坞/学院）自动兴修
        case strategyAndTech   = "strategyAndTech"   // (C1) 四线科技拨款、治国方略、长期国策、税制与央地集权
        case decreesAndReforms = "decreesAndReforms" // (C2) 26 项国策政令自动颁行（反腐/赈灾/劳军/文教/海运等）
        case grandWonders      = "grandWonders"      // (D) 天下奇观与国家大工程自动择优竞建
        case missionsAndGolden = "missionsAndGolden" // (E) 国家霸业使命自动领赏与黄金盛世自动开启
        case wartimeAndVoyage  = "wartimeAndVoyage"  // (F) 战时雇佣兵团紧急招募与四海古迹远征
        case nuclearAndIndustry = "nuclearAndIndustry" // (G) 战时工业动员、核反应堆建设与战略核威慑
    }

    // MARK: - 2. 八大最高执政决策人格原型

    public enum Archetype: String, CaseIterable, Sendable {
        case conqueror  = "雄才拓土型"
        case militarist = "铁血军国型"
        case scholarly  = "文治兴邦型"
        case mercantile = "商贸航海型"
        case diplomat   = "纵横外交型"
        case reformer   = "改革维新型"
        case benevolent = "守成仁政型"
        case autocrat   = "严刑峻法型"

        public var philosophy: String {
            switch self {
            case .conqueror:  return "志在四方、锐意进取，以开疆拓土与建功立业为毕生抱负"
            case .militarist: return "尚武强兵、整军经武，奉行以战止战与铁血国防方略"
            case .scholarly:  return "崇文重教、兴修水利与太学，笃信格物致知乃长治久安之本"
            case .mercantile: return "通商惠工、经略海权，重商埠船坞与财税充盈以富国强兵"
            case .diplomat:   return "纵横捭阖、广结善邻，善以盟约信誉与均势外交化险为夷"
            case .reformer:   return "革故鼎新、除弊兴利，力推制度革新、清肃贪腐与科技跃迁"
            case .benevolent: return "仁厚爱民、与民休息，重仓廪赈济、轻徭薄赋与固守疆土"
            case .autocrat:   return "严刑峻法、乾纲独断，以强力集权与雷霆手腕弹压豪强弊政"
            }
        }
    }

    /// 国家当前最高实权执政者的完整决策画像（供 UI「朝政」页展示与 AI 评分引擎共用）。
    public struct RulerProfile: Sendable, Equatable {
        public let nationId: String
        public let rulerId: Int
        public let rulerName: String
        public let rulerTitle: String
        public let isPremierGoverning: Bool
        public let military: Int
        public let administrative: Int
        public let diplomatic: Int
        public let charisma: Int
        public let traitKeys: [String]
        public let traits: [String]
        public let polity: String
        public let styleId: String
        public let styleLabel: String
        public let archetype: Archetype
        public let summary: String
        public let priorities: [String]

        public init(
            nationId: String,
            rulerId: Int,
            rulerName: String,
            rulerTitle: String,
            isPremierGoverning: Bool,
            military: Int,
            administrative: Int,
            diplomatic: Int,
            charisma: Int,
            traitKeys: [String],
            traits: [String],
            polity: String,
            styleId: String,
            styleLabel: String,
            archetype: Archetype,
            summary: String,
            priorities: [String]
        ) {
            self.nationId = nationId
            self.rulerId = rulerId
            self.rulerName = rulerName
            self.rulerTitle = rulerTitle
            self.isPremierGoverning = isPremierGoverning
            self.military = military
            self.administrative = administrative
            self.diplomatic = diplomatic
            self.charisma = charisma
            self.traitKeys = traitKeys
            self.traits = traits
            self.polity = polity
            self.styleId = styleId
            self.styleLabel = styleLabel
            self.archetype = archetype
            self.summary = summary
            self.priorities = priorities
        }

        /// 形如「大总统·罗斯福」「皇帝·李世民」「征夷大将军·德川家康」的真实执政称谓。
        public var fullDecisionMaker: String {
            if rulerName.isEmpty || rulerName == rulerTitle { return rulerTitle }
            return "\(rulerTitle)·\(rulerName)"
        }

        /// 便于史书奏录引用的四维与特质注记，例如「政务84·外交88·改革家」。
        public var briefSignature: String {
            let dims: [(String, Int)] = [
                ("武略", military), ("政务", administrative), ("外交", diplomatic), ("魅力", charisma)
            ].sorted { $0.1 > $1.1 }
            var parts = ["\(dims[0].0)\(dims[0].1)", "\(dims[1].0)\(dims[1].1)"]
            if let t = traits.first, !t.isEmpty { parts.append(t) }
            return parts.joined(separator: "·")
        }
    }

    /// 朝政 AI 自主决断日志条目。
    public struct CourtLogEntry: Sendable, Equatable {
        public let day: Int
        public let yearText: String
        public let category: String
        public let decisionMaker: String
        public let title: String
        public let detail: String

        public init(day: Int, yearText: String, category: String, decisionMaker: String, title: String, detail: String) {
            self.day = day
            self.yearText = yearText
            self.category = category
            self.decisionMaker = decisionMaker
            self.title = title
            self.detail = detail
        }
    }

    public enum WarStatus: String, Sendable {
        case peace
        case winning
        case stalemate
        case losing
    }

    // MARK: - 3. 月度 O(1) 预索引缓存（每月构建一次，避免任何逐国全图遍历）

    final class MonthCache {
        let world: ObjectIdentifier
        let key: Int
        var portPids = Set<String>()
        var portsByNation = [String: [JS]]()
        var borderPidsByNation = [String: Set<String>]()
        var enemyBorderPidsByNation = [String: Set<String>]()
        var enemiesByNation = [String: [String]]()
        var troopsByNation = [String: Int]()
        var shipsByNation = [String: Int]()
        var provinceCountByNation = [String: Int]()
        var top2ProvinceThreshold: Int = 12
        var capitalPidByNation = [String: String]()
        var hasAllianceOrVassal = Set<String>()
        var wondersOwnedByNation = [String: Int]()
        var buildingWonderNations = Set<String>()
        var takenWonders = Set<String>()
        var exploringNations = Set<String>()
        var takenExpeditions = Set<String>()
        var handledWonderMonth = Set<String>()
        var handledInfraMonth = Set<String>()

        init(_ r: JS, key: Int) {
            self.world = ObjectIdentifier(r)
            self.key = key

            if let ports = Naval.sea?.ports {
                for pt in ports { portPids.insert(pt.provinceId) }
            }

            // 1. 战争敌对关系表（单次遍历）
            var enemySets = [String: Set<String>]()
            if !r.world.statecraft.isNull, !r.world.statecraft.relations.isNull {
                for rel in r.world.statecraft.relations.asArray where rel.status.optionalString == "war" {
                    guard let a = rel.a.optionalString, let b = rel.b.optionalString else { continue }
                    enemySets[a, default: []].insert(b)
                    enemySets[b, default: []].insert(a)
                }
            }
            for (nid, set) in enemySets { enemiesByNation[nid] = Array(set) }

            // 2. 州郡归属、港口、边境、敌境预索引（直接复用 Regimes.currentMonthIndex 或单次遍历）
            let ownerByPid: [String: String]
            if let idx = Regimes.currentMonthIndex, idx.world == ObjectIdentifier(r) {
                ownerByPid = idx.ownerByPid
                for (nid, list) in idx.provincesByNation {
                    provinceCountByNation[nid] = list.count
                    for p in list {
                        let pid = p.id.asString
                        if portPids.contains(pid) { portsByNation[nid, default: []].append(p) }
                    }
                }
                for (nid, armies) in idx.armiesByNation {
                    var sum = 0
                    for a in armies { sum += a.troops.asInt }
                    troopsByNation[nid] = sum
                }
            } else {
                var owners = [String: String]()
                for p in r.world.provinces.asArray {
                    let pid = p.id.asString
                    let ctrl = p.controller.optionalString ?? ""
                    owners[pid] = ctrl
                    if !ctrl.isEmpty {
                        provinceCountByNation[ctrl, default: 0] += 1
                        if portPids.contains(pid) { portsByNation[ctrl, default: []].append(p) }
                    }
                }
                ownerByPid = owners
                for a in r.world.armies.asArray where a.troops.asNumber > 0 && a.status.asString != "destroyed" {
                    if let nid = a.nationId.optionalString { troopsByNation[nid, default: 0] += a.troops.asInt }
                }
            }

            // 边境州与接敌州（单次遍历全图州郡的邻接表，O(P × deg)）
            for p in r.world.provinces.asArray {
                let pid = p.id.asString
                guard let ctrl = ownerByPid[pid], !ctrl.isEmpty else { continue }
                let myEnemies = enemySets[ctrl]
                for nb in p.neighbors.asArray {
                    let nbId = nb.asString
                    guard let oc = ownerByPid[nbId], !oc.isEmpty, oc != ctrl else { continue }
                    borderPidsByNation[ctrl, default: []].insert(pid)
                    if let myEnemies, myEnemies.contains(oc) {
                        enemyBorderPidsByNation[ctrl, default: []].insert(pid)
                    }
                }
            }

            let sortedCounts = provinceCountByNation.values.sorted(by: >)
            top2ProvinceThreshold = sortedCounts.count >= 2 ? sortedCounts[1] : (sortedCounts.first ?? 1)

            // 3. 首都州郡映射（单次遍历城池）
            var cityProvById = [String: String]()
            for c in r.world.cities.asArray {
                if let cid = c.id.optionalString, let pid = c.provinceId.optionalString { cityProvById[cid] = pid }
            }
            for n in r.world.nations.asArray {
                if let cid = n.capitalId.optionalString, let pid = cityProvById[cid] {
                    capitalPidByNation[n.id.asString] = pid
                }
            }

            // 4. 舰队战船数（单次遍历）
            for fl in Naval.fleets(r) where fl.status.optionalString != "lost" {
                if let nid = fl.nationId.optionalString {
                    shipsByNation[nid, default: 0] += max(0, fl.ships.asInt)
                }
            }

            // 5. 同盟与附庸（单次遍历）
            if !r.alliances.isNull, !r.alliances.records.isNull {
                for rec in r.alliances.records.asArray where rec.endedTick.isNull {
                    for m in rec.members.asArray {
                        if let mid = m.optionalString { hasAllianceOrVassal.insert(mid) }
                    }
                }
            }
            if !r.vassals.isNull, !r.vassals.records.isNull {
                for rec in r.vassals.records.asArray where rec.endedTick.isNull {
                    if let ov = rec.overlordId.optionalString { hasAllianceOrVassal.insert(ov) }
                }
            }

            // 6. 奇观与远征现状（单次遍历）
            if !r.regimes.isNull, !r.regimes.wonders.isNull {
                for (wid, row) in r.regimes.wonders.objectEntries {
                    takenWonders.insert(wid)
                    let st = row.status.optionalString ?? ""
                    if st == "building", let b = row.builderId.optionalString {
                        buildingWonderNations.insert(b)
                    } else if st == "done", let pid = row.provinceId.optionalString, let holder = ownerByPid[pid], !holder.isEmpty {
                        wondersOwnedByNation[holder, default: 0] += 1
                    }
                }
            }
            if !r.regimes.isNull, !r.regimes.expeditions.isNull {
                for (sid, row) in r.regimes.expeditions.objectEntries {
                    takenExpeditions.insert(sid)
                    if row.status.optionalString == "exploring", let ex = row.explorerId.optionalString {
                        exploringNations.insert(ex)
                    }
                }
            }
        }
    }

    static var currentMonthCache: MonthCache?

    /// 每月由 `Regimes.day` 开头调用（与 `beginMonthIndex` 成对），建立 O(1) 缓存。
    public static func beginMonth(_ r: JS, key: Int) {
        currentMonthCache = MonthCache(r, key: key)
    }

    /// 每月由 `Regimes.day` 结尾 `defer` 释放缓存。
    public static func endMonth() {
        currentMonthCache = nil
    }

    static func activeCache(_ r: JS) -> MonthCache? {
        guard let c = currentMonthCache, c.world == ObjectIdentifier(r) else { return nil }
        return c
    }

    // MARK: - 4. 执政语境与性格特质归一化

    struct NationContext {
        let nation: JS
        let id: String
        let name: String
        let key: Int
        let day: Int
        let profile: RulerProfile
        let camp: Regimes.PolityCamp
        let gold: Double
        let monthlyIncome: Double
        let corruption: Double
        let destiny: Double
        let stability: Int
        let coupRisk: Int
        let defeatShock: Double
        let atWar: Bool
        let warStatus: WarStatus
        let myTroops: Int
        let enemyTroops: Int
        let avgMorale: Double
        let provinceCount: Int
        let lostCount: Int
        let portCount: Int
        let isIsland: Bool
        let capitalPid: String?
        let reputation: Int
        let traitsNormalized: Set<String>
    }

    /// 将英文特质 key 与中文特质关键词统一映射为标准特质标签，支持自定义人物中英文混写特质。
    static func normalizeTraitTags(keys: [String], labels: [String]) -> Set<String> {
        var tags = Set<String>()
        for raw in keys + labels {
            let s = raw.trimmingCharacters(in: .whitespacesAndNewlines)
            if s.isEmpty { continue }
            tags.insert(s)
            let low = s.lowercased()
            if low == "visionary" || low == "genius" || s.contains("雄才") || s.contains("天才") { tags.insert("visionary") }
            if low == "conqueror" || low == "unifier" || low == "ambitious" || s.contains("开疆") || s.contains("雄心") || s.contains("统一") { tags.insert("expansionist") }
            if low == "hawkish" || low == "brave" || low == "tactician" || low == "veteran" || low == "battlehardened" || low == "strategist" || s.contains("好战") || s.contains("鹰派") || s.contains("兵法") || s.contains("宿将") || s.contains("勇敢") || s.contains("战略") { tags.insert("martial") }
            if low == "benevolent" || low == "merciful" || low == "beloved" || low == "just" || low == "dovish" || s.contains("仁") || s.contains("宽厚") || s.contains("民望") || s.contains("公正") || s.contains("鸽派") { tags.insert("benevolent") }
            if low == "cruel" || low == "tyrant" || low == "wrathful" || low == "stubborn" || s.contains("残暴") || s.contains("暴戾") || s.contains("苛政") || s.contains("易怒") || s.contains("刚愎") { tags.insert("cruel") }
            if low == "ironfist" || low == "lawgiver" || s.contains("铁腕") || s.contains("明法") || s.contains("集权") { tags.insert("ironfist") }
            if low == "reformer" || s.contains("改革") || s.contains("维新") { tags.insert("reformer") }
            if low == "financier" || low == "greedy" || s.contains("理财") || s.contains("贪婪") || s.contains("务实") { tags.insert("financier") }
            if low == "patient" || low == "warweary" || low == "craven" || s.contains("守成") || s.contains("耐心") || s.contains("厌战") || s.contains("懦弱") { tags.insert("cautious") }
            if low == "paranoid" || s.contains("多疑") || s.contains("偏执") { tags.insert("paranoid") }
            if low == "scholar" || low == "administrator" || low == "diligent" || s.contains("学者") || s.contains("崇文") || s.contains("行政") || s.contains("勤政") { tags.insert("scholar") }
            if low == "masterdiplomat" || low == "diplomatic" || low == "socialbutterfly" || low == "charismatic" || low == "naturalleader" || s.contains("外交") || s.contains("纵横") || s.contains("魅力") || s.contains("长袖") || s.contains("领袖") { tags.insert("diplomatic") }
            if low == "seavision" || low == "navalmastery" || low == "shipmaster" || s.contains("海权") || s.contains("海军") || s.contains("船舶") { tags.insert("maritime") }
            if low == "extravagant" || low == "incompetent" || low == "unconvincing" || s.contains("奢靡") || s.contains("无能") { tags.insert("flawed") }
        }
        return tags
    }

    // MARK: - 5. 最高抉择权人物解析（真实头衔 + 四维属性 + 八大执政原型）

    /// 解析指定国家当前真正掌握最高抉择权的实权领袖画像（纯只读，绝不修改存档）。
    public static func profile(_ r: JS, nationId id: String) -> RulerProfile {
        let civ = r.civilization.nations[id]
        let culture = civ.cultureId.optionalString ?? ""
        let polity = civ.polity.optionalString ?? "Kingdom"
        let religion = civ.religionId.optionalString ?? ""
        let st = Regimes.style(r, id)
        let styleProf = Regimes.styleProfile(r, id)
        let seat = Regimes.seats(r, id)

        // 实权掌权者（立宪首相、议会总理、幕府征夷大将军、摄政王优先），否则由国家元首亲政
        let gov = Regimes.governor(r, id)
        let head = Regimes.ruler(r, id)
        let isPremier = (gov != nil)
        let person = gov ?? head

        // 真实最高执政头衔（绝不敷衍写作通用「君主」！）
        let rulerTitle: String = {
            if isPremier, let pTitle = seat.premier, !pTitle.isEmpty {
                if pTitle == "首相" && (st.id == "constitutional" || st.id == "union") {
                    return "内阁首相"
                }
                return pTitle
            }
            let gender = person?.gender.optionalNumber.map(Int.init) ?? 0
            var t = People.rulerTitle(culture: culture, polity: polity, religion: religion, gender: gender)
            if let stTitle = st.title, !stTitle.isEmpty { t = stTitle }
            if let headSeat = seat.head, !headSeat.isEmpty { t = headSeat }
            if st.id == "presidential" && t == "总统" { t = "大总统" }
            if t == "君主" {
                t = (polity == "Empire") ? (gender == 1 ? "女皇" : "皇帝") : (gender == 1 ? "女王" : "国王")
            }
            if gender == 1 {
                t = NativeEngine.femaleTitles[t] ?? t
            }
            if person == nil {
                let lex = LocalizationEngine.lexicon(culture: culture, polity: polity, style: st.id)
                return lex.isRepublican ? "临时执政委员会" : "中枢摄政会议"
            }
            return t
        }()

        let rulerName: String = {
            guard let p = person else { return "" }
            if !isPremier && MonarchLore.isJapaneseEmperor(culture: culture, title: rulerTitle, polity: polity) {
                let given = (p.firstName.optionalString ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
                if !given.isEmpty { return given }
            }
            return NativeEngine.displayPersonName(p)
        }()

        let rulerId = person?.id.optionalNumber.map(Int.init) ?? -1
        func readStat(_ key: String) -> Int {
            guard let p = person, !p.base.isNull else { return 50 }
            let raw = p.base[key].optionalNumber ?? 50
            return max(0, min(100, Int(raw.isFinite ? raw.rounded() : 50)))
        }
        let mil = readStat("military")
        let adm = readStat("administrative")
        let dip = readStat("diplomatic")
        let cha = readStat("charisma")

        let traitKeys: [String] = {
            guard let p = person, !p.traits.isNull, p.traits.isArray else { return [] }
            return p.traits.asArray.compactMap(\.optionalString)
        }()
        let traitLabels: [String] = traitKeys.map { NativeEngine.traitLabels[$0] ?? $0 }
        let tags = normalizeTraitTags(keys: traitKeys, labels: traitLabels)

        // 读取实时局势（优先使用月度缓存，零全图扫描）
        let cache = activeCache(r)
        let provCount = cache?.provinceCountByNation[id] ?? Regimes.monthLandCount(r, id)
        let portCount: Int = {
            if let c = cache { return c.portsByNation[id]?.count ?? 0 }
            guard let ports = Naval.sea?.ports, !ports.isEmpty else { return 0 }
            let portSet = Set(ports.map(\.provinceId))
            return Regimes.monthLand(r, id).reduce(0) { $0 + (portSet.contains($1.id.asString) ? 1 : 0) }
        }()
        let isIsland = portCount > 0 && (cache.map { ($0.borderPidsByNation[id]?.isEmpty ?? true) } ?? false)
        let atWar = Regimes.isAtWar(r, id)
        let fin = r.finance.nations[id]
        let gold = fin.isNull ? 0 : (fin.gold.optionalNumber ?? 0)
        let income = max(1, fin.isNull ? 1 : (fin.goldPerMonth.optionalNumber ?? 1))
        let corrupt = Finance.corruption(r, id)
        let destiny = r.destiny.nations[id].destiny.optionalNumber ?? 50
        let personaKey = Regimes.persona(r, id)?.key ?? "balanced"
        let livelihood = r.economy.nations[id].ethnic.optionalString ?? ""

        // 八大执政人格原型加权评分
        var scores: [Archetype: Double] = [
            .conqueror:  Double(mil) * 0.58 + Double(cha) * 0.32 + Double(adm) * 0.10,
            .militarist: Double(mil) * 0.72 + Double(adm) * 0.16 + Double(cha) * 0.12,
            .scholarly:  Double(adm) * 0.68 + Double(dip) * 0.20 + Double(cha) * 0.12,
            .mercantile: Double(adm) * 0.42 + Double(dip) * 0.44 + Double(cha) * 0.14,
            .diplomat:   Double(dip) * 0.64 + Double(cha) * 0.30 + Double(adm) * 0.06,
            .reformer:   Double(adm) * 0.56 + Double(dip) * 0.24 + Double(cha) * 0.20,
            .benevolent: Double(cha) * 0.48 + Double(adm) * 0.34 + Double(dip) * 0.18,
            .autocrat:   Double(mil) * 0.40 + Double(adm) * 0.44 + Double(100 - dip) * 0.16,
        ]

        // 性格特质显著加权
        if tags.contains("visionary")    { scores[.conqueror, default: 0] += 18; scores[.reformer, default: 0] += 14 }
        if tags.contains("expansionist") { scores[.conqueror, default: 0] += 24; scores[.militarist, default: 0] += 12 }
        if tags.contains("martial")      { scores[.militarist, default: 0] += 22; scores[.conqueror, default: 0] += 14 }
        if tags.contains("benevolent")   { scores[.benevolent, default: 0] += 26; scores[.diplomat, default: 0] += 8 }
        if tags.contains("cruel")        { scores[.autocrat, default: 0] += 24; scores[.militarist, default: 0] += 10 }
        if tags.contains("ironfist")     { scores[.autocrat, default: 0] += 26; scores[.reformer, default: 0] += 8 }
        if tags.contains("paranoid")     { scores[.autocrat, default: 0] += 18 }
        if tags.contains("reformer")     { scores[.reformer, default: 0] += 28; scores[.scholarly, default: 0] += 10 }
        if tags.contains("financier")    { scores[.mercantile, default: 0] += 24; scores[.scholarly, default: 0] += 8 }
        if tags.contains("scholar")      { scores[.scholarly, default: 0] += 24; scores[.reformer, default: 0] += 12 }
        if tags.contains("diplomatic")   { scores[.diplomat, default: 0] += 24; scores[.mercantile, default: 0] += 8 }
        if tags.contains("maritime")     { scores[.mercantile, default: 0] += 26; scores[.conqueror, default: 0] += 8 }
        if tags.contains("cautious")     { scores[.benevolent, default: 0] += 16; scores[.diplomat, default: 0] += 8 }

        // 政体阵营、细政体、生计与国家性格联动
        switch styleProf.camp {
        case .authoritarian:
            scores[.militarist, default: 0] += 16; scores[.autocrat, default: 0] += 14
        case .tribal:
            scores[.conqueror, default: 0] += 14; scores[.militarist, default: 0] += 14
        case .republic:
            scores[.mercantile, default: 0] += 10; scores[.diplomat, default: 0] += 10; scores[.reformer, default: 0] += 8
        case .constitutional:
            scores[.reformer, default: 0] += 14; scores[.diplomat, default: 0] += 10; scores[.scholarly, default: 0] += 8
        case .socialist:
            scores[.reformer, default: 0] += 16; scores[.autocrat, default: 0] += 8; scores[.scholarly, default: 0] += 6
        case .theocracy:
            scores[.benevolent, default: 0] += 14; scores[.scholarly, default: 0] += 10
        case .monarchy:
            if st.id == "shogunate" || st.id == "sultanate" || st.id == "margraviate" || st.id == "mamluk" {
                scores[.militarist, default: 0] += 14
            } else if st.id == "despotism" || st.id == "tsardom" {
                scores[.autocrat, default: 0] += 12; scores[.conqueror, default: 0] += 8
            } else if st.id == "empire" || st.id == "dynasty" {
                scores[.conqueror, default: 0] += 8; scores[.scholarly, default: 0] += 6
            }
        }
        if ["merchant", "dogate", "hanseatic", "freeCity"].contains(st.id) { scores[.mercantile, default: 0] += 22 }
        if st.id == "technocracy" { scores[.scholarly, default: 0] += 20; scores[.reformer, default: 0] += 12 }
        if livelihood == "Maritime" || livelihood == "Commercial" { scores[.mercantile, default: 0] += 14 }
        if livelihood == "Nomadic" { scores[.conqueror, default: 0] += 12; scores[.militarist, default: 0] += 10 }
        if portCount >= 2 || isIsland { scores[.mercantile, default: 0] += (isIsland ? 14 : 8) }

        switch personaKey {
        case "expansionist": scores[.conqueror, default: 0] += 12
        case "martial":      scores[.militarist, default: 0] += 12
        case "steadfast":    scores[.benevolent, default: 0] += 12
        case "mercantile":   scores[.mercantile, default: 0] += 14
        case "pious":        scores[.benevolent, default: 0] += 8; scores[.scholarly, default: 0] += 6
        default: break
        }

        // 确定性选出最高分原型
        var bestArch: Archetype = .scholarly
        var bestScore = -1e9
        for a in Archetype.allCases {
            let sc = scores[a] ?? 0
            if sc > bestScore { bestScore = sc; bestArch = a }
        }

        // 动态生成三大当期执政优先纲领
        var priorities = [String]()
        if atWar {
            priorities.append(mil >= 65 ? "全军整备、火器军械升级与战时佣兵破阵" : "筹措战时军饷、固守边塞要塞与维系士气")
        }
        if corrupt >= 32 {
            priorities.append("铁腕清查吏治腐化与整顿度支财税")
        } else if destiny < 46 {
            priorities.append("轻徭薄赋、开仓赈济与提振国运民心")
        }
        if gold < income * 3 && priorities.count < 3 {
            priorities.append("扩建商埠市集、广开税基与充实国库")
        }
        let archPriorities: [String] = {
            switch bestArch {
            case .conqueror:
                return [
                    "推进军备兵学科技与军功强军方略",
                    portCount > 0 ? "扩建宝船船坞与远洋跨海投送" : "兴建边疆奇观工程与万里要塞",
                    "达成霸业使命并择机开启国家黄金盛世",
                ]
            case .militarist:
                return [
                    "强化边塞关隘要塞与全国军械换装",
                    "优先突破军备科技与大阅精锐禁军",
                    "兴建神机军器监或万里边城等军事奇观",
                ]
            case .scholarly:
                return [
                    "大兴太学学院工坊与四线科技均衡突破",
                    "修筑农田水利与驿路驰道以厚植国本",
                    "筹建稷下太学宫或观星司天监等文教奇观",
                ]
            case .mercantile:
                return [
                    "广设商埠市集与深水海港船坞以通海贸",
                    "推进农商工坊与航海造船科技领跑诸邦",
                    "兴建丝路商馆、大运河或沧溟大灯塔奇观",
                ]
            case .diplomat:
                return [
                    "广结善邻、维护国际信誉与通商协定",
                    "以商埠与治政科技巩固邦交与财政稳健",
                    "派遣远征探访四海古迹并统筹稳健改制",
                ]
            case .reformer:
                return [
                    "推行维新变法、整肃贪腐与治政典章科技",
                    "优化央地集权、农田水利与太学育才体系",
                    "以制度革新与大工程驱动国家步入盛世",
                ]
            case .benevolent:
                return [
                    "广修农田水利、常平义仓与轻徭薄赋安民",
                    "修缮边塞关隘自保并稳步提升民心国运",
                    "兴建天下常平万仓或圜丘圣坛护佑社稷",
                ]
            case .autocrat:
                return [
                    "实行高度集权、清丈田亩与严查地方贪墨",
                    "强化国防动员、要塞壁垒与中枢控权",
                    "大兴万国皇城或军器监工程彰显威权",
                ]
            }
        }()
        for item in archPriorities where priorities.count < 3 {
            if !priorities.contains(item) { priorities.append(item) }
        }

        // 生动且个性化的 1–2 句执政哲学评述
        let maker = rulerName.isEmpty ? rulerTitle : "\(rulerTitle)·\(rulerName)"
        let traitClause = traitLabels.isEmpty ? "" : "，身具「\(traitLabels.prefix(2).joined(separator: "」「"))」之性"
        let topDim: String = {
            let dims = [("武略", mil), ("政务", adm), ("外交", dip), ("魅力", cha)].sorted { $0.1 > $1.1 }
            return "\(dims[0].0)(\(dims[0].1))与\(dims[1].0)(\(dims[1].1))"
        }()
        let situationClause: String = {
            if atWar { return "时值兵戈交锋，中枢正全力协调军费、要塞与前线补给。" }
            if corrupt >= 36 { return "鉴于吏治积弊偏重（腐化 \(Int(corrupt.rounded()))），当下首重肃贪整纲。" }
            if portCount >= 2 || isIsland { return "凭依 \(portCount) 处海港之利，正着力经略船坞商埠与远洋开拓。" }
            if provCount >= 10 { return "坐拥 \(provCount) 州广土，正统筹大工程奇观、水利基建与科技跃升。" }
            return "值此承平之际，正循序推进州郡基建、科技研发与长远国策。"
        }()
        let summary = "\(maker)（\(st.label)）以\(topDim)见长\(traitClause)，属「\(bestArch.rawValue)」：\(bestArch.philosophy)。\(situationClause)"

        return RulerProfile(
            nationId: id,
            rulerId: rulerId,
            rulerName: rulerName,
            rulerTitle: rulerTitle,
            isPremierGoverning: isPremier,
            military: mil,
            administrative: adm,
            diplomatic: dip,
            charisma: cha,
            traitKeys: traitKeys,
            traits: traitLabels,
            polity: polity,
            styleId: st.id,
            styleLabel: st.label,
            archetype: bestArch,
            summary: summary,
            priorities: Array(priorities.prefix(3))
        )
    }

    // MARK: - 6. 朝政 AI 决断奏录存储与只读导出（单国最多保留 24 条）

    public static let maxCourtLogEntries = 24

    public static func formatYearText(_ r: JS) -> String {
        let d = r.life.currentDate
        let yearOffset = (!r.regimes.isNull && !r.regimes.calendar.isNull)
            ? (r.regimes.calendar.offset.optionalNumber.flatMap { $0.isFinite ? Int($0) : nil } ?? 0) : 0
        let era = (!r.regimes.isNull && !r.regimes.calendar.isNull)
            ? (r.regimes.calendar.era.optionalString ?? "") : ""
        let rawY = d.isNull ? (r.world.day.asInt / 365 + 1) : d.year.asInt
        let y = rawY + yearOffset
        let m = d.isNull ? max(1, min(12, (r.world.day.asInt % 365) / 30 + 1)) : max(1, min(12, d.month.asInt))
        if y <= 0 {
            let bce = y < 0 ? -y : 1
            return era.isEmpty ? "前\(bce)年\(m)月" : "\(era)（前\(bce)年）\(m)月"
        }
        if era.isEmpty { return "\(y)年\(m)月" }
        if era.hasSuffix("年") || era.hasSuffix("载") { return "\(era)（\(y)年）\(m)月" }
        return "\(era)\(y)年\(m)月"
    }

    /// 写入一条详实的最高执政自主决断奏录至 `r.regimes.aiCourtLog[nationId]`（上限 24 条）。
    public static func recordCourtDecision(
        _ r: JS,
        nationId id: String,
        category: String,
        decisionMaker: String,
        title: String,
        detail: String
    ) {
        guard !r.regimes.isNull else { return }
        if r.regimes.aiCourtLog.isNull { r.regimes.aiCourtLog = JS.object() }
        var list = r.regimes.aiCourtLog[id].isArray ? r.regimes.aiCourtLog[id].asArray : [JS]()
        let row = JS.object()
        row.day = JS(r.world.day.asInt)
        row.yearText = JS(formatYearText(r))
        row.category = JS(category)
        row.decisionMaker = JS(decisionMaker)
        row.title = JS(title)
        row.detail = JS(detail)
        list.append(row)
        if list.count > maxCourtLogEntries {
            list = Array(list.suffix(maxCourtLogEntries))
        }
        r.regimes.aiCourtLog[id] = .array(list)
    }

    /// 纯只读导出最高执政画像 JSON（供 `NativeEngine.court(_:)` 挂载 `c.aiProfile`）。
    public static func profileJS(_ r: JS, nationId id: String) -> JS {
        let p = profile(r, nationId: id)
        let o = JS.object()
        o.rulerName = JS(p.rulerName)
        o.rulerTitle = JS(p.rulerTitle)
        o.archetype = JS(p.archetype.rawValue)
        o.summary = JS(p.summary)
        o.military = JS(p.military)
        o.administrative = JS(p.administrative)
        o.diplomatic = JS(p.diplomatic)
        o.charisma = JS(p.charisma)
        o.traits = .array(p.traits.map { JS($0) })
        o.priorities = .array(p.priorities.map { JS($0) })
        return o
    }

    /// 纯只读导出近期朝政自主决断奏录数组（倒序最新在前，供 `NativeEngine.court(_:)` 挂载 `c.aiCourtLog`）。
    public static func courtLogJS(_ r: JS, nationId id: String, limit: Int = 16) -> JS {
        guard !r.regimes.isNull, !r.regimes.aiCourtLog.isNull, r.regimes.aiCourtLog[id].isArray else {
            return .array()
        }
        let arr = r.regimes.aiCourtLog[id].asArray
        let slice = Array(arr.suffix(max(1, limit)).reversed()).map { $0.clone() }
        return .array(slice)
    }

    /// 纯只读读取近期朝政日志 Swift 结构体数组。
    public static func courtLog(_ r: JS, nationId id: String, limit: Int = 16) -> [CourtLogEntry] {
        guard !r.regimes.isNull, !r.regimes.aiCourtLog.isNull, r.regimes.aiCourtLog[id].isArray else { return [] }
        return r.regimes.aiCourtLog[id].asArray.suffix(max(1, limit)).reversed().map { row in
            CourtLogEntry(
                day: row.day.asInt,
                yearText: row.yearText.asString,
                category: row.category.asString,
                decisionMaker: row.decisionMaker.asString,
                title: row.title.asString,
                detail: row.detail.asString
            )
        }
    }

    /// 判断某国是否允许 AI 自动裁决事件链与朝议法案。
    public static func isAutoDecisionEnabled(_ r: JS, nationId id: String) -> Bool {
        guard !r.regimes.isNull else { return true }
        let nb = r.regimes.nations[id]
        if !nb.isNull && nb.autoDecideSet.isTruthy { return nb.autoDecide.isTruthy }
        return Regimes.isAutoGoverned(r, id)
    }

    // MARK: - 7. 国家月度上下文构造（O(1) 缓存优先）

    private static func makeContext(_ r: JS, nation n: JS, id: String, key: Int) -> NationContext {
        let cache = activeCache(r)
        let prof = profile(r, nationId: id)
        let styleProf = Regimes.styleProfile(r, id)
        let fin = r.finance.nations[id]
        let gold = fin.isNull ? 0 : (fin.gold.optionalNumber ?? 0)
        let income = max(1, fin.isNull ? 1 : (fin.goldPerMonth.optionalNumber ?? 1))
        let corrupt = Finance.corruption(r, id)
        let destiny = r.destiny.nations[id].destiny.optionalNumber ?? 50
        let outlook = Regimes.coupOutlook(r, id)
        let shock = Regimes.defeatPenalty(r, id)
        let atWar = Regimes.isAtWar(r, id)

        let provCount = cache?.provinceCountByNation[id] ?? Regimes.monthLandCount(r, id)
        let lostCount = Regimes.monthLostCount(r, id)
        let portCount = cache?.portsByNation[id]?.count ?? {
            guard let ports = Naval.sea?.ports, !ports.isEmpty else { return 0 }
            let portSet = Set(ports.map(\.provinceId))
            return Regimes.monthLand(r, id).reduce(0) { $0 + (portSet.contains($1.id.asString) ? 1 : 0) }
        }()
        let isIsland = portCount > 0 && (cache.map { ($0.borderPidsByNation[id]?.isEmpty ?? true) } ?? false)
        let armies = Regimes.monthArmies(r, id)
        let myTroops = cache?.troopsByNation[id] ?? armies.reduce(0) { $0 + $1.troops.asInt }
        let avgMorale = armies.isEmpty ? 85.0 : (armies.reduce(0.0) { $0 + ($1.morale.optionalNumber ?? 70) } / Double(armies.count))

        var enemyTroops = 0
        if atWar {
            let enemies: [String]
            if let c = cache {
                enemies = c.enemiesByNation[id] ?? []
                for e in enemies { enemyTroops += c.troopsByNation[e] ?? 0 }
            } else {
                var eSet = Set<String>()
                for rel in r.world.statecraft.relations.asArray where rel.status.optionalString == "war" {
                    if rel.a.optionalString == id, let b = rel.b.optionalString { eSet.insert(b) }
                    else if rel.b.optionalString == id, let a = rel.a.optionalString { eSet.insert(a) }
                }
                for e in eSet {
                    for a in Regimes.monthArmies(r, e) { enemyTroops += a.troops.asInt }
                }
            }
        }

        let warStatus: WarStatus = {
            if !atWar { return .peace }
            if lostCount >= 2 || (enemyTroops > 0 && Double(myTroops) < Double(enemyTroops) * 0.72) { return .losing }
            if lostCount == 0 && Double(myTroops) > Double(max(1, enemyTroops)) * 1.32 { return .winning }
            return .stalemate
        }()

        let capPid = cache?.capitalPidByNation[id] ?? Rebellion.capitalProvince(r, id)
        let rep = WorldDepth.reputation(r, nation: id)
        let tags = normalizeTraitTags(keys: prof.traitKeys, labels: prof.traits)

        return NationContext(
            nation: n,
            id: id,
            name: n.name.asString,
            key: key,
            day: r.world.day.asInt,
            profile: prof,
            camp: styleProf.camp,
            gold: gold,
            monthlyIncome: income,
            corruption: corrupt,
            destiny: destiny,
            stability: outlook.stability,
            coupRisk: outlook.risk,
            defeatShock: shock,
            atWar: atWar,
            warStatus: warStatus,
            myTroops: myTroops,
            enemyTroops: enemyTroops,
            avgMorale: avgMorale,
            provinceCount: provCount,
            lostCount: lostCount,
            portCount: portCount,
            isIsland: isIsland,
            capitalPid: capPid,
            reputation: rep,
            traitsNormalized: tags
        )
    }

    // MARK: - 8. 全系统统一月度驱动入口

    /// 单国每月自主治理总管线：遍历 `Subsystem.allCases`，按最高执政者属性与实时局势自主运行全部治理系统。
    public static func month(
        _ r: JS,
        nation n: JS,
        id: String,
        key: Int,
        addGold: (Double) -> Void,
        addDestiny: (Double) -> Void
    ) {
        guard UnitKinds.enabled, !r.regimes.isNull, r.regimes.enabled.isTruthy else { return }
        guard !Regimes.isBlank(r, id), Regimes.monthLandCount(r, id) > 0 else { return }
        let autoGovern = Regimes.isAutoGoverned(r, id)
        let autoDecide = isAutoDecisionEnabled(r, nationId: id)
        // 若既未开启自动治理又未开启自动裁决，则仅保留超期（≥6月）兜底事件链裁决（由 WorldDepth.month 触发）
        guard autoGovern || autoDecide else { return }

        let ctx = makeContext(r, nation: n, id: id, key: key)
        for sub in Subsystem.allCases {
            switch sub {
            case .eventChains:
                if autoDecide { resolveEventChainIfDue(r, ctx: ctx) }
            case .courtAgendas:
                if autoDecide { resolveCourtAgendaIfDue(r, ctx: ctx, addDestiny: addDestiny) }
            case .provincialInfra:
                if autoGovern { developProvinces(r, ctx: ctx) }
            case .strategyAndTech:
                if autoGovern { advanceStrategyAndTech(r, ctx: ctx) }
            case .decreesAndReforms:
                if autoGovern { enactAutonomousDecree(r, ctx: ctx) }
            case .grandWonders:
                if autoGovern { considerGrandWonder(r, ctx: ctx) }
            case .missionsAndGolden:
                if autoGovern { claimMissionsAndGoldenAge(r, ctx: ctx) }
            case .wartimeAndVoyage:
                if autoGovern { handleWartimeAndExpeditions(r, ctx: ctx) }
            case .nuclearAndIndustry:
                if autoGovern { manageNuclearAndIndustry(r, ctx: ctx) }
            }
        }
    }

    // MARK: - Subsystem (A1): 16 组多阶段因果事件链抉择

    /// 由 `WorldDepth.month` 或 `SovereignAI.month` 调用：根据最高执政者四维属性、性格特质、政体与实时危局为所有候选项精准打分并拍板。
    public static func resolveEventChainIfDue(_ r: JS, nationId id: String, key: Int) {
        guard UnitKinds.enabled, !r.regimes.isNull, r.regimes.enabled.isTruthy else { return }
        guard !r.regimes.eventChains.isNull, !r.regimes.eventChains[id].isNull else { return }
        guard let n = r.world.nations.asArray.first(where: { $0.id.asString == id }) else { return }
        let ctx = makeContext(r, nation: n, id: id, key: key)
        resolveEventChainIfDue(r, ctx: ctx)
    }

    private static func resolveEventChainIfDue(_ r: JS, ctx: NationContext) {
        let id = ctx.id
        guard !r.regimes.eventChains.isNull, !r.regimes.eventChains[id].isNull,
              let cid = r.regimes.eventChains[id].id.optionalString else { return }
        let spawnedM = r.regimes.eventChains[id].month.optionalNumber.map(Int.init) ?? ctx.key
        let elapsed = max(0, ctx.key - spawnedM)
        let autoDec = isAutoDecisionEnabled(r, nationId: id)
        // 自动裁决开启时满 1 个月即由执政者果断拍板；手动模式下搁置满 6 个月则由中枢兜底决断防永久卡死
        guard (autoDec && elapsed >= 1) || elapsed >= 6 else { return }
        guard let tmpl = WorldDepth.eventChainTemplates.first(where: { $0.id == cid }), !tmpl.choices.isEmpty else { return }

        var bestIdx = 0
        var bestScore = -1e9
        var bestRationale = "审时度势、权衡利弊"
        for (idx, choice) in tmpl.choices.enumerated() {
            let eval = scoreEventChoice(tmpl: tmpl, choiceIndex: idx, choiceId: choice.id, ctx: ctx)
            if eval.score > bestScore {
                bestScore = eval.score
                bestIdx = idx
                bestRationale = eval.rationale
            }
        }
        let chosen = tmpl.choices[bestIdx]
        let res = WorldDepth.applyEventChain(r, nationId: id, chainId: cid, choice: chosen.id, autoResolved: true)
        if res.ok {
            let maker = ctx.profile.fullDecisionMaker
            let sig = ctx.profile.briefSignature
            recordCourtDecision(
                r,
                nationId: id,
                category: "抉择",
                decisionMaker: maker,
                title: "「\(tmpl.title)」→ 采纳「\(chosen.label)」",
                detail: "\(maker)（\(sig)）\(bestRationale)，批示采纳「\(chosen.label)」：\(res.reason)"
            )
        }
    }

    /// 为事件链的任意候选选项（0, 1, 2...）计算确定性综合效用分与拟人化决断理由。
    public static func scoreEventChoice(
        tmpl: WorldDepth.ChainTemplate,
        choiceIndex: Int,
        choiceId: String,
        r: JS,
        nationId: String,
        key: Int
    ) -> (score: Double, rationale: String) {
        let n = r.world.nations.asArray.first(where: { $0.id.asString == nationId }) ?? JS.object()
        let ctx = makeContext(r, nation: n, id: nationId, key: key)
        return scoreEventChoice(tmpl: tmpl, choiceIndex: choiceIndex, choiceId: choiceId, ctx: ctx)
    }

    private static func scoreEventChoice(
        tmpl: WorldDepth.ChainTemplate,
        choiceIndex: Int,
        choiceId: String,
        ctx: NationContext
    ) -> (score: Double, rationale: String) {
        let p = ctx.profile
        let tags = ctx.traitsNormalized
        let isA = (choiceId == "a" || choiceIndex == 0)
        let costA = WorldDepth.chainOptACost(tmpl.id)
        if isA && costA > 0 && ctx.gold < costA {
            return (-10_000, "国库捉襟见肘，无力承担高额支出")
        }

        // 确定性微扰（±2.5），避免同质化且完全可重放
        let jitter = (Double(Regimes.draw("\(ctx.id)|\(ctx.key)|ev|\(tmpl.id)|\(choiceIndex)") % 500) / 100.0) - 2.5
        var score = 50.0 + jitter
        var reason = "权衡国库与政局利弊"

        let mil = Double(p.military), adm = Double(p.administrative), dip = Double(p.diplomatic), cha = Double(p.charisma)
        let rich = ctx.gold >= max(costA + ctx.monthlyIncome * 2.0, 380)
        let tight = ctx.gold < max(costA + 90, ctx.monthlyIncome * 2.0)

        switch tmpl.id {
        case "famineRelief":
            if isA {
                score += (cha * 0.45 + adm * 0.35) - (tight ? 22 : 0) + (rich ? 14 : 0)
                if tags.contains("benevolent") || tags.contains("scholar") { score += 26; reason = "体恤黎庶、力主开仓救民" }
                else if ctx.destiny < 50 || ctx.stability < 50 { score += 22; reason = "忧心民变损及国本，急拨官银赈灾" }
                else { reason = "秉持爱民固本之念，拨款开仓赈济灾民" }
                if tags.contains("cruel") { score -= 24 }
                if ctx.camp == .republic || ctx.camp == .constitutional || ctx.camp == .theocracy { score += 10 }
            } else {
                score += (mil * 0.35 + (ctx.atWar ? 24 : 0) + (tight ? 28 : 0))
                if tags.contains("cruel") || tags.contains("ironfist") { score += 24; reason = "铁腕保军需、宁负民怨不误国用" }
                else if ctx.atWar { score += 16; reason = "值此战事吃紧，决意优先强征军粮保前线" }
                else { reason = "虑及国库告急，忍痛征粮以固度支" }
            }

        case "plagueContainment":
            if isA {
                score += (adm * 0.50 + cha * 0.25) + (rich ? 12 : -14)
                if tags.contains("benevolent") || tags.contains("scholar") || tags.contains("reformer") { score += 22; reason = "以民生丁口为重，果断封关检疫施药" }
                else { reason = "严防时疫扩散伤及根本，下令封路检疫" }
            } else {
                score += (dip * 0.25 + (tight ? 26 : 0))
                if tags.contains("financier") || p.archetype == .mercantile { score += 18; reason = "恐断绝商道重创税基，执意维持开市通商" }
                else { reason = "为保财政税源不断，决意维持商路运转" }
            }

        case "maritimeBoom":
            if isA {
                score += (mil * 0.55 + (ctx.portCount >= 2 ? 12 : 0))
                if tags.contains("martial") || tags.contains("maritime") || p.archetype == .militarist || p.archetype == .conqueror {
                    score += 24; reason = "锐意掌控远洋制海权，严令水师出舰清剿海匪"
                } else { reason = "整饬海疆秩序，遣水师铁腕肃清商道" }
            } else {
                score += (dip * 0.45 + adm * 0.30 + (tight ? 18 : 0))
                if tags.contains("financier") || tags.contains("diplomatic") || p.archetype == .mercantile || ctx.camp == .republic {
                    score += 24; reason = "善以招安市舶化匪为商，大开远洋关税财源"
                } else { reason = "权衡招抚利厚，下令招安海商并设市舶司" }
            }

        case "mightyGeneral":
            if isA {
                score += (mil * 0.52 + cha * 0.22 + (ctx.atWar ? 26 : 0))
                if tags.contains("martial") || tags.contains("expansionist") || p.archetype == .conqueror || p.archetype == .militarist {
                    score += 22; reason = "惜才重将、志在沙场，加恩重赏以振三军士气"
                } else { reason = "正值用人之际，委以重任激励将士效命" }
                if tags.contains("paranoid") { score -= 28 }
            } else {
                score += (adm * 0.52 + (ctx.corruption >= 30 ? 18 : 0) + (ctx.coupRisk >= 40 ? 22 : 0))
                if tags.contains("paranoid") || tags.contains("ironfist") || p.archetype == .autocrat {
                    score += 28; reason = "深忌悍将尾大不掉，断然轮调收拢兵权以安中枢"
                } else { reason = "着眼长治久安与文武制衡，温和轮调收拢兵权" }
            }

        case "enlightenmentReform":
            if isA {
                score += (adm * 0.45 + dip * 0.25 + (rich ? 14 : -16))
                if tags.contains("reformer") || tags.contains("scholar") || tags.contains("visionary") || p.archetype == .reformer || p.archetype == .scholarly {
                    score += 28; reason = "力排众议、顺应新学思潮，倾力推行维新变法"
                } else { reason = "着眼科技跃迁与长远国力，拨款推行维新新政" }
                if ctx.camp == .republic || ctx.camp == .constitutional || ctx.camp == .socialist { score += 12 }
            } else {
                score += (cha * 0.30 + (ctx.stability < 48 ? 20 : 0) + (tight ? 20 : 0))
                if tags.contains("cautious") || p.archetype == .benevolent || ctx.camp == .theocracy {
                    score += 22; reason = "慎防激进变法动摇社稷，决意恪守旧章稳步改良"
                } else { reason = "为稳民心与国库，择取渐进改良之路" }
            }

        case "antiHegemonLeague":
            if isA {
                score += (dip * 0.60 + cha * 0.20 + (ctx.reputation < 60 ? 16 : 0))
                if tags.contains("diplomatic") || tags.contains("benevolent") || p.archetype == .diplomat || ctx.camp == .republic || ctx.camp == .constitutional {
                    score += 26; reason = "审度天下均势，果断响应合纵广结盟好"
                } else { reason = "以合纵连横之策广结诸邻，抬升国际声望" }
            } else {
                score += (mil * 0.55 + (ctx.atWar ? 14 : 0))
                if tags.contains("martial") || tags.contains("ironfist") || tags.contains("cruel") || p.archetype == .militarist || p.archetype == .autocrat {
                    score += 24; reason = "不信外盟虚诺，决意独善其身暗蓄精锐军备"
                } else { reason = "立足自强之本，婉拒盟议并加紧扩军备战" }
            }

        case "frontierTrade":
            if isA {
                score += (dip * 0.48 + adm * 0.28 + (tight ? 14 : 0))
                if tags.contains("financier") || tags.contains("diplomatic") || p.archetype == .mercantile || p.archetype == .diplomat {
                    score += 24; reason = "力主以茶马互市富边安邦，兼收商税与良马之利"
                } else { reason = "顺应边贸大势，诏开官办互市怀柔远人" }
            } else {
                score += (mil * 0.50 + (ctx.atWar ? 20 : 0))
                if tags.contains("martial") || tags.contains("cautious") || p.archetype == .militarist || p.archetype == .autocrat {
                    score += 22; reason = "谨防边患乘隙入寇，严守关隘加固边墙"
                } else { reason = "以边防安危为先，拒开互市并加固边镇城垒" }
            }

        case "saltIronMonopoly":
            if isA {
                score += (mil * 0.30 + (tight ? 28 : 0) + (ctx.atWar ? 18 : 0))
                if tags.contains("ironfist") || tags.contains("cruel") || p.archetype == .autocrat || ctx.camp == .authoritarian || ctx.camp == .socialist {
                    score += 24; reason = "收拢盐铁专卖大权以充中枢国帑，强干弱枝"
                } else { reason = "急筹国用军资，推行盐铁官营专卖" }
                if ctx.corruption >= 40 { score -= 18 }
            } else {
                score += (adm * 0.48 + dip * 0.28 + (ctx.corruption >= 32 ? 22 : 0))
                if tags.contains("financier") || tags.contains("reformer") || p.archetype == .mercantile || p.archetype == .reformer || ctx.camp == .republic {
                    score += 24; reason = "力主藏富于民、放宽民间工商冶铸以兴税基"
                } else { reason = "忧心官营滋生贪墨，放宽专卖鼓励百业兴盛" }
            }

        case "artisanGuild":
            if isA {
                score += (adm * 0.40 + mil * 0.35 + (rich ? 16 : -14))
                if tags.contains("scholar") || tags.contains("reformer") || tags.contains("visionary") || p.archetype == .reformer || p.archetype == .scholarly {
                    score += 22; reason = "重赏天下巧匠、倾资官办示范工坊以促军农器械革新"
                } else { reason = "慷慨拨款设官营工坊，谋求精械量产之长效" }
            } else {
                score += (dip * 0.30 + (tight ? 24 : 0))
                if p.archetype == .mercantile || ctx.camp == .republic {
                    score += 18; reason = "推行专利护商之制，轻投入激发民间工坊活力"
                } else { reason = "节制公帑开支，颁布专利令由民间自兴工坊" }
            }

        case "academyDebate":
            if isA {
                score += (adm * 0.52 + (ctx.corruption >= 28 ? 16 : 0))
                if tags.contains("scholar") || tags.contains("reformer") || p.archetype == .reformer || p.archetype == .scholarly {
                    score += 26; reason = "力倡格物实学与考课新章，以实用科技富国清吏"
                } else { reason = "重视经世致用，批示推崇实学与官吏考课" }
            } else {
                score += (cha * 0.50 + dip * 0.22 + (ctx.destiny < 55 ? 20 : 0))
                if tags.contains("benevolent") || p.archetype == .benevolent || ctx.camp == .theocracy {
                    score += 24; reason = "尊崇礼法教化以凝聚万民向心力、稳固国运"
                } else { reason = "借文教礼仪收拢天下人心，抬升国运与信誉" }
            }

        case "fiscalCrisis":
            if isA {
                score += (adm * 0.55 + (ctx.corruption >= 28 ? 26 : 0))
                if tags.contains("ironfist") || tags.contains("reformer") || tags.contains("scholar") || p.archetype == .reformer || p.archetype == .autocrat {
                    score += 26; reason = "雷霆清查冗费、裁撤浮员，从根源肃清贪腐积弊"
                } else { reason = "果断整饬度支浮费，力图清廉开源" }
            } else {
                score += (dip * 0.35 + (ctx.gold < 180 ? 28 : 0) + (ctx.atWar ? 18 : 0))
                if tags.contains("financier") || p.archetype == .mercantile || ctx.camp == .republic {
                    score += 20; reason = "善用国家信用发行公债，速筹巨资以济时急"
                } else { reason = "急需大笔现银周转，决意举债筹资度过难关" }
            }

        case "grandVoyage":
            if isA {
                score += (dip * 0.35 + cha * 0.30 + (ctx.portCount >= 2 ? 16 : 0) + (rich ? 14 : -18))
                if tags.contains("maritime") || tags.contains("visionary") || tags.contains("expansionist") || p.archetype == .mercantile || p.archetype == .conqueror {
                    score += 28; reason = "怀抱远洋开拓雄心，重金资助大航海船队扬帆远航"
                } else { reason = "看好远海航路厚利，批准拨款开启大航海计划" }
            } else {
                score += (adm * 0.35 + (tight ? 24 : 0))
                if tags.contains("cautious") || p.archetype == .benevolent {
                    score += 22; reason = "务实守成、不冒险轻掷重金，决意专意近海防务"
                } else { reason = "审慎核算海贸风险，择取近海稳健方略" }
            }

        case "arsenalTrial":
            if isA {
                score += (mil * 0.60 + (ctx.atWar ? 24 : 0) + (rich ? 14 : -18))
                if tags.contains("martial") || tags.contains("expansionist") || tags.contains("visionary") || p.archetype == .militarist || p.archetype == .conqueror {
                    score += 26; reason = "深谙兵贵精锐之道，拨付专款全军换装新式火炮军械"
                } else { reason = "着眼强军备战，拍板批拨军费列装新式重械" }
            } else {
                score += (adm * 0.32 + (tight ? 24 : 0))
                if tags.contains("cautious") || tags.contains("benevolent") || p.archetype == .benevolent {
                    score += 20; reason = "严控军费以免透支民力，令兵工厂小批试装"
                } else { reason = "稳健控费，先作小批试装徐图后进" }
            }

        case "bumperAmnesty":
            if isA {
                score += (cha * 0.45 + adm * 0.25 + (ctx.destiny < 60 ? 18 : 0))
                if tags.contains("benevolent") || p.archetype == .benevolent || p.archetype == .scholarly {
                    score += 26; reason = "值此大稔丰年，力主普免秋粮与民休息、滋养丁口"
                } else { reason = "借丰年施恩天下，普免田赋以厚植民心国运" }
            } else {
                score += (adm * 0.38 + mil * 0.22 + (ctx.atWar ? 20 : 0) + (tight ? 16 : 0))
                if tags.contains("financier") || tags.contains("ironfist") || p.archetype == .militarist || p.archetype == .autocrat {
                    score += 22; reason = "居安思危、未雨绸缪，收储义仓以备荒年军需"
                } else { reason = "稳健储粮实库，购储义仓以防后患" }
            }

        case "polityCrossroad":
            if isA {
                score += (adm * 0.42 + dip * 0.42 + (ctx.corruption >= 30 ? 16 : 0))
                if tags.contains("reformer") || tags.contains("diplomatic") || tags.contains("benevolent") || p.archetype == .reformer || p.archetype == .diplomat {
                    score += 26; reason = "力推代表制与法度公开，以宪政清廉凝聚朝野共识"
                } else { reason = "顺应制度演进，批示扩大法度公开与监督" }
                if ctx.camp == .republic || ctx.camp == .constitutional { score += 18 }
                if ctx.camp == .authoritarian || ctx.camp == .monarchy { score -= 10 }
            } else {
                score += (mil * 0.48 + (ctx.atWar ? 20 : 0))
                if tags.contains("ironfist") || tags.contains("martial") || tags.contains("cruel") || p.archetype == .autocrat || p.archetype == .militarist || p.archetype == .conqueror {
                    score += 26; reason = "力主乾纲独断与强力集权，集中全国财力强化战备"
                } else { reason = "因应内外压力，决意强化中枢集权与备战" }
                if ctx.camp == .monarchy || ctx.camp == .authoritarian || ctx.camp == .tribal || ctx.camp == .socialist { score += 16 }
            }

        case "harborBoom":
            if isA {
                score += (mil * 0.35 + adm * 0.35 + (ctx.isIsland ? 18 : 0) + (rich ? 14 : -16))
                if tags.contains("maritime") || tags.contains("ironfist") || p.archetype == .conqueror || p.archetype == .militarist {
                    score += 24; reason = "着眼深水海权与远洋舰队泊位，由官府拨资扩建巨型船坞"
                } else { reason = "重金疏浚航道、官督修建深水船坞以强海防" }
            } else {
                score += (dip * 0.40 + (tight ? 22 : 0))
                if tags.contains("financier") || p.archetype == .mercantile || ctx.camp == .republic {
                    score += 24; reason = "推行商民合股共兴港口，广聚商税并带动工商繁荣"
                } else { reason = "引入商民资本合建海港，轻费兴商并丰盈国库" }
            }

        default:
            if isA {
                score += (adm * 0.4 + cha * 0.3) + (rich ? 10 : -15)
                reason = "综合权衡长远收益，批示施行甲案"
            } else {
                score += (dip * 0.3 + (tight ? 18 : 0))
                reason = "立足稳健务实考量，批示采纳乙案"
            }
        }

        return (score, reason)
    }

    // MARK: - Subsystem (A2): 朝堂/议会多分支政治议案与权力调衡

    private static func resolveCourtAgendaIfDue(_ r: JS, ctx: NationContext, addDestiny: (Double) -> Void) {
        let id = ctx.id
        let b = Regimes.book(r, id)
        let cdUntil = b.agendaCooldownUntil.optionalNumber.map(Int.init) ?? 0
        guard ctx.day >= cdUntil else { return }

        let civ = r.civilization.nations[id]
        let lex = LocalizationEngine.lexicon(culture: civ.cultureId.optionalString, polity: civ.polity.optionalString, style: ctx.profile.styleId)
        let shockPct = Int((ctx.defeatShock * 100).rounded())
        let topic: String = {
            if shockPct >= 5 { return "accountability" }
            if ctx.stability < 44 && !(b.powerBias.optionalString ?? "").isEmpty { return "imbalance" }
            if ctx.atWar { return "wartax" }
            if ctx.corruption >= 32 || ctx.gold < 260 { return "fiscal" }
            if ctx.coupRisk >= 44 { return "curbhouses" }
            return "civil"
        }()

        let p = ctx.profile
        let tags = ctx.traitsNormalized
        let mil = Double(p.military), adm = Double(p.administrative), dip = Double(p.diplomatic), cha = Double(p.charisma)

        // 为 4 条路线（force / compromise / bargain / table）逐一评分
        let costForce: Double = (topic == "accountability") ? 180 : (topic == "imbalance") ? 220 : (topic == "civil") ? 160 : 0
        let costBargain: Double = (topic == "imbalance") ? 320 : 0

        var branchScores: [(branch: String, score: Double, rationale: String)] = []
        let jBase = Double(Regimes.draw("\(id)|\(ctx.key)|agenda|\(topic)") % 100) / 25.0

        // 1. force（铁腕强推）
        if ctx.gold >= costForce {
            var sc = 48.0 + mil * 0.34 + adm * 0.24 + jBase
            if tags.contains("ironfist") || tags.contains("cruel") || tags.contains("martial") || tags.contains("expansionist") { sc += 22 }
            if p.archetype == .autocrat || p.archetype == .militarist || p.archetype == .conqueror { sc += 16 }
            if ctx.camp == .monarchy || ctx.camp == .authoritarian || ctx.camp == .socialist { sc += 10 }
            if topic == "fiscal" && ctx.corruption >= 38 { sc += 18 }
            if topic == "civil" && ctx.gold >= 480 { sc += 14 }
            branchScores.append(("force", sc, "乾纲独断、力排众议强推新案"))
        }

        // 2. compromise（折中稳健）
        do {
            var sc = 52.0 + adm * 0.32 + dip * 0.32 + cha * 0.16
            if tags.contains("benevolent") || tags.contains("diplomatic") || tags.contains("reformer") || tags.contains("scholar") { sc += 20 }
            if p.archetype == .benevolent || p.archetype == .diplomat || p.archetype == .reformer || p.archetype == .scholarly { sc += 14 }
            if ctx.camp == .republic || ctx.camp == .constitutional { sc += 14 }
            if ctx.stability < 50 { sc += 12 }
            branchScores.append(("compromise", sc, "兼顾朝野各方诉求，力主折中稳健推行"))
        }

        // 3. bargain（派系让利/筹款）
        if ctx.gold >= costBargain {
            var sc = 42.0 + dip * 0.28 + (ctx.gold < 220 && topic != "imbalance" ? 26 : 0)
            if tags.contains("financier") || p.archetype == .mercantile { sc += 18 }
            if ctx.profile.styleId == "oligarchic" || ctx.profile.styleId == "merchant" || ctx.profile.styleId == "feudal" { sc += 16 }
            if topic == "wartax" && ctx.warStatus == .losing { sc += 18 }
            branchScores.append(("bargain", sc, "审时度势以权易资、联合强势派系共济时艰"))
        }

        // 4. table（暂缓休会）
        do {
            var sc = 30.0 + (tags.contains("cautious") || tags.contains("flawed") ? 24 : 0)
            if ctx.gold < 140 && (topic == "civil" || topic == "imbalance") { sc += 22 }
            branchScores.append(("table", sc, "暂避锋芒、休会冷静以待时机"))
        }

        let picked = branchScores.max(by: { $0.score < $1.score }) ?? ("compromise", 50, "稳健议决")
        let branch = picked.branch
        let cooldownSpan = (branch == "table") ? 90 : 180
        b.agendaCooldownUntil = JS(ctx.day + cooldownSpan)

        let fin = r.finance.nations[id]
        let gold = fin.isNull ? 0 : (fin.gold.optionalNumber ?? 0)
        let armies = Regimes.monthArmies(r, id)
        var title = "本期\(lex.agendaTag)"
        var outcome = ""

        switch (topic, branch) {
        case ("accountability", "force"):
            title = lex.isRepublican ? "《国防听证与军备重整法案》" : "《战后问责与整军复仇案》"
            if !fin.isNull { fin.gold = JS(max(0, gold - min(gold, 180))) }
            if !r.regimes.defeatShock.isNull { r.regimes.defeatShock.delete(id) }
            for a in armies { a.morale = JS(min(100, (a.morale.optionalNumber ?? 50) + 25)) }
            addDestiny(-2)
            outcome = "强硬追责：耗 180 金清除战败震荡，全军士气 +25。"
        case ("accountability", "compromise"):
            title = lex.isRepublican ? "《国防听证与军备重整法案》" : "《战后问责与整军复仇案》"
            if !r.regimes.defeatShock.isNull, let cur = r.regimes.defeatShock[id].optionalNumber { r.regimes.defeatShock[id] = JS(cur * 0.5) }
            for a in armies { a.morale = JS(min(100, (a.morale.optionalNumber ?? 50) + 14)) }
            addDestiny(4)
            outcome = "温和重整：战败震荡减半、全军士气 +14、国运 +4。"
        case ("accountability", "bargain"):
            title = lex.isRepublican ? "《国防听证与军备重整法案》" : "《战后问责与整军复仇案》"
            if !r.regimes.defeatShock.isNull { r.regimes.defeatShock.delete(id) }
            for a in armies { a.supplies = JS(100); a.morale = JS(min(100, (a.morale.optionalNumber ?? 50) + 18)) }
            b.powerBias = JS("military")
            outcome = "授军方扩编特权：震荡消除、全军满补给，权力倾向\(lex.pillarShort[2])。"
        case ("imbalance", "force"):
            title = lex.isRepublican ? "《宪政制衡与权力纠偏法案》" : "《整肃纲纪与制衡权势案》"
            if !fin.isNull { fin.gold = JS(max(0, gold - min(gold, 220))) }
            b.powerBias = JS("")
            Finance.setCorruption(r, id, max(0, ctx.corruption - 10))
            addDestiny(5)
            outcome = "铁腕削权：耗 220 金重置权力天平、腐化 −10、国运 +5。"
        case ("imbalance", "compromise"):
            title = lex.isRepublican ? "《宪政制衡与权力纠偏法案》" : "《整肃纲纪与制衡权势案》"
            b.powerBias = JS("council")
            addDestiny(4)
            outcome = "分权协定：温和调衡政局、国运 +4。"
        case ("imbalance", "bargain"):
            title = lex.isRepublican ? "《宪政制衡与权力纠偏法案》" : "《整肃纲纪与制衡权势案》"
            if !fin.isNull { fin.gold = JS(max(0, gold - min(gold, 320))) }
            b.powerBias = JS("")
            Finance.setCorruption(r, id, max(0, ctx.corruption - 5))
            addDestiny(6)
            outcome = "利益赎买：耗 320 金安抚强势派系、腐化 −5、国运 +6。"
        case ("wartax", "force"):
            title = lex.isRepublican ? "《战时国防特别预算与债券法案》" : "《战时急征军饷与前线犒师案》"
            if !fin.isNull { fin.gold = JS(gold + 380) }
            for a in armies { a.morale = JS(min(100, (a.morale.optionalNumber ?? 50) + 18)); a.supplies = JS(100) }
            Finance.setCorruption(r, id, min(100, ctx.corruption + 4))
            addDestiny(-2)
            outcome = "全额特饷：国库 +380 金、全军满补给且士气 +18（腐化 +4、国运 −2）。"
        case ("wartax", "compromise"):
            title = lex.isRepublican ? "《战时国防特别预算与债券法案》" : "《战时急征军饷与前线犒师案》"
            if !fin.isNull { fin.gold = JS(gold + 220) }
            for a in armies { a.morale = JS(min(100, (a.morale.optionalNumber ?? 50) + 12)) }
            addDestiny(2)
            outcome = "折中军债：国库 +220 金、全军士气 +12、国运 +2。"
        case ("wartax", "bargain"):
            title = lex.isRepublican ? "《战时国防特别预算与债券法案》" : "《战时急征军饷与前线犒师案》"
            if !fin.isNull { fin.gold = JS(gold + 520) }
            for a in armies { a.supplies = JS(100) }
            b.powerBias = JS("houses")
            outcome = "派系筹款：国库 +520 金、全军满补给，权力倾向\(lex.pillarShort[1])。"
        case ("fiscal", "force"):
            title = lex.isRepublican ? "《联邦审计反腐与税制改革法案》" : "《整顿盐铁与清查亏空案》"
            Finance.setCorruption(r, id, max(0, ctx.corruption - 14))
            if !fin.isNull { fin.gold = JS(gold + 320) }
            addDestiny(-1)
            outcome = "雷霆查账：腐化 −14，追缴国库 +320 金。"
        case ("fiscal", "compromise"):
            title = lex.isRepublican ? "《联邦审计反腐与税制改革法案》" : "《整顿盐铁与清查亏空案》"
            Finance.setCorruption(r, id, max(0, ctx.corruption - 8))
            if !fin.isNull { fin.gold = JS(gold + 180) }
            addDestiny(3)
            outcome = "渐进税改：腐化 −8，国库 +180 金，国运 +3。"
        case ("fiscal", "bargain"):
            title = lex.isRepublican ? "《联邦审计反腐与税制改革法案》" : "《整顿盐铁与清查亏空案》"
            if !fin.isNull { fin.gold = JS(gold + 460) }
            Finance.setCorruption(r, id, min(100, ctx.corruption + 3))
            b.powerBias = JS("houses")
            outcome = "特许筹款：国库 +460 金（腐化 +3）。"
        case ("curbhouses", "force"):
            title = lex.isRepublican ? "《反垄断拆分财团与选举透明法案》" : "《清丈勋贵田庄与抑豪强案》"
            let ruling = People.rulingFamilyId(r, id)
            if let fams = Regimes.currentMonthIndex?.familiesByNation[id], !r.nobility.isNull, !r.nobility.families.isNull {
                for fid in fams where Int(fid) != ruling {
                    let fam = r.nobility.families[fid]
                    if !fam.isNull { fam.influence = JS(max(10, (fam.influence.optionalNumber ?? 60) - 30)) }
                }
            }
            if !fin.isNull { fin.gold = JS(gold + 340) }
            Finance.setCorruption(r, id, max(0, ctx.corruption - 8))
            outcome = "强力抑强：\(lex.houseUnitLabel)权重 −30，国库 +340 金，腐化 −8。"
        case ("curbhouses", "compromise"):
            title = lex.isRepublican ? "《反垄断拆分财团与选举透明法案》" : "《清丈勋贵田庄与抑豪强案》"
            let ruling = People.rulingFamilyId(r, id)
            if let fams = Regimes.currentMonthIndex?.familiesByNation[id], !r.nobility.isNull, !r.nobility.families.isNull {
                for fid in fams where Int(fid) != ruling {
                    let fam = r.nobility.families[fid]
                    if !fam.isNull { fam.influence = JS(max(10, (fam.influence.optionalNumber ?? 60) - 15)) }
                }
            }
            if !fin.isNull { fin.gold = JS(gold + 200) }
            Finance.setCorruption(r, id, max(0, ctx.corruption - 5))
            addDestiny(3)
            outcome = "协商纳税：权重 −15，国库 +200 金，腐化 −5，国运 +3。"
        case ("curbhouses", "bargain"):
            title = lex.isRepublican ? "《反垄断拆分财团与选举透明法案》" : "《清丈勋贵田庄与抑豪强案》"
            b.powerBias = JS("houses")
            addDestiny(4)
            outcome = "纳入共治：缓和内部对立、国运 +4。"
        case ("civil", "force"):
            title = lex.isRepublican ? "《国民教育普及与基建振兴法案》" : "《开科取士与劝农兴学案》"
            if !fin.isNull { fin.gold = JS(max(0, gold - min(gold, 160))) }
            for prov in Regimes.monthLand(r, id) {
                if let s = Regimes.monthStock(r, prov.id.asString) {
                    s.population = JS(((s.population.optionalNumber ?? 0) * 1.03).rounded())
                }
            }
            Finance.setCorruption(r, id, max(0, ctx.corruption - 6))
            addDestiny(6)
            outcome = "全力兴办：耗 160 金，全境人口 +3%、腐化 −6、国运 +6。"
        case ("civil", "compromise"):
            title = lex.isRepublican ? "《国民教育普及与基建振兴法案》" : "《开科取士与劝农兴学案》"
            for prov in Regimes.monthLand(r, id) {
                if let s = Regimes.monthStock(r, prov.id.asString) {
                    s.population = JS(((s.population.optionalNumber ?? 0) * 1.02).rounded())
                }
            }
            Finance.setCorruption(r, id, max(0, ctx.corruption - 4))
            addDestiny(4)
            outcome = "稳健推进：全境人口 +2%、腐化 −4、国运 +4。"
        case ("civil", "bargain"):
            title = lex.isRepublican ? "《国民教育普及与基建振兴法案》" : "《开科取士与劝农兴学案》"
            for prov in Regimes.monthLand(r, id) {
                if let s = Regimes.monthStock(r, prov.id.asString) {
                    s.population = JS(((s.population.optionalNumber ?? 0) * 1.02).rounded())
                    s.grain = JS(((s.grain.optionalNumber ?? 0) * 1.15).rounded())
                }
            }
            b.powerBias = JS("houses")
            outcome = "合营募资：全境人口 +2%、存粮 +15%。"
        default:
            Finance.setCorruption(r, id, max(0, ctx.corruption - 3))
            if !fin.isNull && (topic == "civil" || topic == "imbalance") { fin.gold = JS(gold + 130) }
            addDestiny(3)
            outcome = "休会搁置：平息党派争端，腐化 −3、国运 +3（90 日后重开议期）。"
        }

        b.agendaLastTitle = JS(title)
        b.agendaLastOutcome = JS(outcome)
        let maker = p.fullDecisionMaker
        recordCourtDecision(
            r,
            nationId: id,
            category: "抉择",
            decisionMaker: maker,
            title: "议决\(title)",
            detail: "\(maker)（\(p.briefSignature)）\(picked.rationale)：\(outcome)"
        )
    }

    // MARK: - Subsystem (B): 州郡五类基建自动建设（水利 / 商埠 / 要塞 / 船坞 / 学院）

    /// 供 `WorldDepth.month` 在单独测试/调用时复用，月内自动去重防重复建。
    public static func developProvincesIfNeeded(_ r: JS, nationId id: String, key: Int) {
        guard UnitKinds.enabled, !r.regimes.isNull, r.regimes.enabled.isTruthy else { return }
        guard Regimes.isAutoGoverned(r, id) else { return }
        if let c = activeCache(r), c.handledInfraMonth.contains(id) { return }
        guard let n = r.world.nations.asArray.first(where: { $0.id.asString == id }) else { return }
        let ctx = makeContext(r, nation: n, id: id, key: key)
        developProvinces(r, ctx: ctx)
    }

    private static func developProvinces(_ r: JS, ctx: NationContext) {
        let id = ctx.id
        if let c = activeCache(r) {
            guard c.handledInfraMonth.insert(id).inserted else { return }
        }
        let fin = r.finance.nations[id]
        guard !fin.isNull else { return }
        var gold = fin.gold.optionalNumber ?? 0
        // 至少保留 2.5 个月岁入作为安全国库缓冲；小国/大国每季动态建设 1–3 处基建（每月也会检查，按季度配额控速防爆库）
        let reserve = max(140.0, ctx.monthlyIncome * 2.5)
        guard gold >= reserve + 140.0 else { return }

        let b = Regimes.book(r, id)
        let qKey = ctx.key / 3
        let maxPerQuarter = ctx.provinceCount >= 14 ? 3 : (ctx.provinceCount >= 6 ? 2 : 1)
        let usedInQuarter = (b.aiInfraQKey.optionalNumber.map(Int.init) == qKey)
            ? (b.aiInfraQUsed.optionalNumber.map(Int.init) ?? 0) : 0
        guard usedInQuarter < maxPerQuarter else { return }

        let land = Regimes.monthLand(r, id)
        guard !land.isEmpty else { return }

        let cache = activeCache(r)
        let portSet = cache?.portPids ?? Set((Naval.sea?.ports ?? []).map(\.provinceId))
        let borderSet = cache?.borderPidsByNation[id] ?? []
        let enemyBorderSet = cache?.enemyBorderPidsByNation[id] ?? []
        let p = ctx.profile
        let tags = ctx.traitsNormalized

        // 限制扫描上限（大国精选首都、港口、边境与高人口前 18 州），保证严格线性有界 O(1) 级性能
        let sampleProvs: [JS] = {
            if land.count <= 18 { return land }
            var scored = [(prov: JS, w: Double)]()
            scored.reserveCapacity(land.count)
            for prov in land {
                let pid = prov.id.asString
                var w = (Regimes.monthStock(r, pid)?.population.optionalNumber ?? 1000) / 1000.0
                if pid == ctx.capitalPid { w += 500 }
                if enemyBorderSet.contains(pid) { w += 350 }
                else if borderSet.contains(pid) { w += 120 }
                if portSet.contains(pid) { w += 180 }
                scored.append((prov, w))
            }
            return scored.sorted { $0.w > $1.w }.prefix(18).map(\.prov)
        }()

        // 评估所有州郡 × 5 类基建槽，挑出本轮最高价值项目
        let remainingBuilds = min(maxPerQuarter - usedInQuarter, gold >= reserve + 700 ? 2 : 1)
        var builtCount = 0

        for _ in 0..<remainingBuilds {
            var best: (prov: JS, slot: WorldDepth.InfraSlot, nextLvl: Int, cost: Double, score: Double, reason: String)?
            for prov in sampleProvs {
                let pid = prov.id.asString
                let isPort = portSet.contains(pid)
                let isCap = (pid == ctx.capitalPid)
                let isBorder = borderSet.contains(pid)
                let isEnemyBorder = enemyBorderSet.contains(pid)
                let stock = Regimes.monthStock(r, pid)
                let pop = stock?.population.optionalNumber ?? 5000
                let grain = stock?.grain.optionalNumber ?? 10_000
                let sp = Trade.of(r, pid)
                let hasDis = Regimes.disasterAt(r, pid) != nil

                for slot in WorldDepth.InfraSlot.allCases {
                    let curLvl: Int
                    let cost: Double
                    let nextLvl: Int
                    if slot == .shipyard {
                        guard isPort else { continue }
                        let dockLvl = SeaDominion.shipyardLevel(r, provinceId: pid)
                        guard dockLvl < 3 else { continue }
                        curLvl = dockLvl
                        nextLvl = dockLvl + 1
                        cost = dockLvl == 1 ? 260.0 : 480.0
                    } else {
                        curLvl = WorldDepth.infraLevel(r, provinceId: pid, slot: slot)
                        guard curLvl < 3 else { continue }
                        nextLvl = curLvl + 1
                        cost = slot.cost(nextLevel: nextLvl)
                    }
                    guard gold >= reserve + cost else { continue }

                    var sc = 35.0 - Double(curLvl) * 9.0
                    var reason = ""

                    switch slot {
                    case .irrigation:
                        sc += min(32.0, pop / 4500.0)
                        if sp == 0 { sc += 14 } // 粮食特产州
                        if grain < pop * 1.4 || hasDis { sc += 22 }
                        if p.archetype == .scholarly || p.archetype == .benevolent || p.archetype == .reformer { sc += 16 }
                        if tags.contains("benevolent") || tags.contains("scholar") { sc += 10 }
                        sc += Double(p.administrative) * 0.16
                        reason = hasDis || grain < pop * 1.4 ? "防旱抗荒、厚植民食" : "劝课农桑、扩大丁口承载"

                    case .market:
                        sc += min(28.0, pop / 5000.0)
                        if isCap { sc += 16 }
                        if isPort { sc += 14 }
                        if sp == 5 || sp == 6 || sp == 8 { sc += 22 } // 海盐/丝绸/香料
                        if p.archetype == .mercantile || p.archetype == .diplomat { sc += 22 }
                        if tags.contains("financier") || ctx.camp == .republic { sc += 14 }
                        sc += Double(p.administrative + p.diplomatic) * 0.10
                        reason = (sp == 5 || sp == 6 || sp == 8) ? "依托本地战略特产广开商税" : "繁荣商埠市集、拓宽国家财源"

                    case .fortress:
                        if isEnemyBorder { sc += 38 }
                        else if isBorder { sc += 20 }
                        else if isCap { sc += 10 }
                        else { sc -= 22 }
                        if ctx.atWar { sc += 16 }
                        if p.archetype == .militarist || p.archetype == .benevolent || p.archetype == .autocrat { sc += 14 }
                        if tags.contains("martial") || tags.contains("cautious") { sc += 10 }
                        sc += Double(p.military) * 0.18
                        reason = isEnemyBorder ? "临敌前沿告急，急筑雄关要塞御敌" : "加固边疆重镇城防，固守疆土"

                    case .shipyard:
                        sc += (ctx.isIsland ? 28 : 12) + (ctx.portCount >= 2 ? 10 : 0)
                        if p.archetype == .mercantile || p.archetype == .conqueror { sc += 20 }
                        if tags.contains("maritime") { sc += 20 }
                        if ctx.atWar && ctx.portCount > 0 { sc += 8 }
                        sc += Double(p.military + p.diplomatic) * 0.08
                        reason = ctx.isIsland ? "岛国命脉所系，扩建干船坞壮大远洋水师" : "经略海权港湾，提升战船泊位与造舰速率"

                    case .academy:
                        if isCap { sc += 26 }
                        sc += min(20.0, pop / 6000.0)
                        if p.archetype == .scholarly || p.archetype == .reformer { sc += 24 }
                        if tags.contains("scholar") || tags.contains("reformer") || tags.contains("visionary") { sc += 14 }
                        sc += Double(p.administrative) * 0.22
                        reason = "兴办太学学院工坊，加速四线时代科技演进"
                    }

                    // 轻微确定性扰动以增加自然分布
                    sc += Double(Regimes.draw("\(id)|\(ctx.key)|infra|\(pid)|\(slot.rawValue)") % 40) / 10.0

                    if best.map({ sc > $0.score }) ?? true {
                        best = (prov, slot, nextLvl, cost, sc, reason)
                    }
                }
            }

            guard let pick = best, pick.score >= 38 else { break }
            let pid = pick.prov.id.asString
            gold = max(0, gold - pick.cost)
            fin.gold = JS(gold)

            if pick.slot == .shipyard {
                let sbook = Shipyards.book(r)
                if sbook.levels.isNull { sbook.levels = JS.object() }
                sbook.levels[pid] = JS(pick.nextLvl)
                if r.regimes.infra.isNull { r.regimes.infra = JS.object() }
                if r.regimes.infra[pid].isNull { r.regimes.infra[pid] = JS.object() }
                r.regimes.infra[pid].shipyard = JS(max(0, pick.nextLvl - 1))
            } else {
                if r.regimes.infra.isNull { r.regimes.infra = JS.object() }
                if r.regimes.infra[pid].isNull { r.regimes.infra[pid] = JS.object() }
                r.regimes.infra[pid][pick.slot.rawValue] = JS(pick.nextLvl)

                switch pick.slot {
                case .fortress:
                    let d = r.upperCombat.provinces[pid]
                    if !d.isNull {
                        let sd = Int((d.storedDefense.optionalNumber ?? 1).rounded())
                        d.storedDefense = JS(min(10, sd + 1))
                        if sd + 1 >= 3 { d.manualSet = JS(true); d.manualFortress = JS(true) }
                    }
                case .irrigation:
                    let fp = r.finance.provinces[pid]
                    if !fp.isNull {
                        let cap = fp.maxPopulation.optionalNumber ?? 10_000
                        fp.maxPopulation = JS((cap * 1.10).rounded())
                    }
                case .academy:
                    WorldDepth.addTechProgress(r, nation: id, branch: .statecraft, points: 10)
                default:
                    break
                }
            }

            builtCount += 1
            let pName = pick.prov.name.asString
            let maker = p.fullDecisionMaker
            recordCourtDecision(
                r,
                nationId: id,
                category: "基建",
                decisionMaker: maker,
                title: "兴修\(pName) \(pick.nextLvl)级\(pick.slot.label)",
                detail: "\(maker)（\(p.briefSignature)）为\(pick.reason)，拨银 \(Int(pick.cost)) 金于\(pName)兴建 \(pick.nextLvl) 级\(pick.slot.label)。"
            )
            _ = People.recordHistory(
                r, kind: "event",
                text: "\(ctx.name)\(pName)建成 \(pick.nextLvl) 级\(pick.slot.label)",
                reason: "\(maker)批示拨金 \(Int(pick.cost)) 兴修基建（\(pick.reason)）。",
                nations: [id], province: pid
            )
        }

        if builtCount > 0 {
            b.aiInfraQKey = JS(qKey)
            b.aiInfraQUsed = JS(usedInQuarter + builtCount)
        }
    }

    // MARK: - Subsystem (C1): 治国方略、科技突破、税制与央地集权自动调配

    private static func advanceStrategyAndTech(_ r: JS, ctx: NationContext) {
        let id = ctx.id
        let b = Regimes.book(r, id)
        let fin = r.finance.nations[id]
        let p = ctx.profile
        let tags = ctx.traitsNormalized

        // 1. 四线科技拨款加速（每季评估，国库充裕时积极推进；优先执政者专长与实时短板）
        let techCd = b.aiTechCooldownUntil.optionalNumber.map(Int.init) ?? 0
        if !fin.isNull && ctx.day >= techCd {
            let gold = fin.gold.optionalNumber ?? 0
            let reserve = max(200.0, ctx.monthlyIncome * 3.0)
            var bestBranch: (branch: WorldDepth.TechBranch, cost: Double, score: Double, why: String)?
            let avgLvl = Double(WorldDepth.TechBranch.allCases.reduce(0) { $0 + WorldDepth.techLevel(r, nation: id, branch: $1) }) / 4.0

            for branch in WorldDepth.TechBranch.allCases {
                let lvl = WorldDepth.techLevel(r, nation: id, branch: branch)
                guard lvl < 5 else { continue }
                let cost = Double(150 + lvl * 70)
                guard gold >= reserve + cost else { continue }
                if branch == .naval && ctx.portCount == 0 { continue }

                var sc = 40.0 + (avgLvl - Double(lvl)) * 12.0 + Double(WorldDepth.techProgress(r, nation: id, branch: branch)) * 0.18
                var why = ""
                switch branch {
                case .military:
                    sc += Double(p.military) * 0.45 + (ctx.atWar ? 22 : 0)
                    if p.archetype == .militarist || p.archetype == .conqueror { sc += 18 }
                    if tags.contains("martial") { sc += 12 }
                    why = ctx.atWar ? "战时急需新式军械与兵法突破" : "强军备战、提升野战与破城威力"
                case .economy:
                    sc += Double(p.administrative) * 0.35 + Double(p.diplomatic) * 0.15
                    if p.archetype == .mercantile || p.archetype == .scholarly || p.archetype == .benevolent { sc += 16 }
                    if tags.contains("financier") || tags.contains("scholar") { sc += 12 }
                    why = "革新农商工坊技艺、厚植财政岁入"
                case .statecraft:
                    sc += Double(p.administrative) * 0.45 + (ctx.corruption >= 26 ? 18 : 0) + (ctx.provinceCount >= 10 ? 12 : 0)
                    if p.archetype == .reformer || p.archetype == .scholarly || p.archetype == .autocrat { sc += 18 }
                    if tags.contains("reformer") || tags.contains("ironfist") { sc += 12 }
                    why = "完善典章考课、压制吏治腐化与大国负荷"
                case .naval:
                    sc += Double(p.diplomatic) * 0.28 + Double(p.military) * 0.22 + (ctx.isIsland ? 28 : Double(min(4, ctx.portCount)) * 6.0)
                    if p.archetype == .mercantile { sc += 18 }
                    if tags.contains("maritime") { sc += 22 }
                    why = "突破远洋造船与舰炮火力、夺取海域制海权"
                }

                if bestBranch.map({ sc > $0.score }) ?? true {
                    bestBranch = (branch, cost, sc, why)
                }
            }

            if let pick = bestBranch {
                let beforeLvl = WorldDepth.techLevel(r, nation: id, branch: pick.branch)
                fin.gold = JS(max(0, gold - pick.cost))
                WorldDepth.addTechProgress(r, nation: id, branch: pick.branch, points: 36)
                let afterLvl = WorldDepth.techLevel(r, nation: id, branch: pick.branch)
                let afterProg = WorldDepth.techProgress(r, nation: id, branch: pick.branch)
                b.aiTechCooldownUntil = JS(ctx.day + (gold >= reserve + 900 ? 60 : 90))
                let maker = p.fullDecisionMaker
                let outcome = afterLvl > beforeLvl
                    ? "成功突破至 \(afterLvl) 阶「\(pick.branch.tierName(afterLvl))」！"
                    : "研发进度推进至 \(afterProg)%。"
                recordCourtDecision(
                    r,
                    nationId: id,
                    category: "科技",
                    decisionMaker: maker,
                    title: "拨款推进「\(pick.branch.label)」",
                    detail: "\(maker)（\(p.briefSignature)）着眼\(pick.why)，斥资 \(Int(pick.cost)) 金资助\(pick.branch.label)：\(outcome)"
                )
            }
        }

        // 2. 治国大战略预设与长期国策自动演进（遵守 180–360 日转轨冷却 + 独立制度槽位上限）
        let stratLock = max(
            b.strategyCooldownUntil.optionalNumber.map(Int.init) ?? 0,
            b.aiStrategyLockUntil.optionalNumber.map(Int.init) ?? 0
        )
        if ctx.day >= stratLock {
            let desiredPreset: String = {
                if ctx.warStatus == .losing || (ctx.atWar && (p.archetype == .militarist || p.archetype == .conqueror || p.archetype == .autocrat)) {
                    return "warMobilize"
                }
                if ctx.corruption >= 38 || ctx.stability < 46 {
                    return "stabilize"
                }
                switch p.archetype {
                case .militarist: return "warMobilize"
                case .conqueror:  return ctx.portCount >= 2 ? "expand" : "warMobilize"
                case .mercantile: return "prosperTrade"
                case .diplomat:   return "prosperTrade"
                case .scholarly, .reformer: return "techFocus"
                case .benevolent, .autocrat: return "stabilize"
                }
            }()

            let curStrategy = b.strategy.optionalString ?? ""
            if curStrategy != desiredPreset {
                let spec: (title: String, reforms: [String], bias: String) = {
                    switch desiredPreset {
                    case "warMobilize":  return ("战时动员", ["conscription", "junxian", "jungong", "audit"], "military")
                    case "prosperTrade": return ("富国兴商", ["seaopen", "free", "liangshui", "guild", "minting"], "council")
                    case "stabilize":    return ("固本维稳", ["keju", "juntian", "audit", "charter"], "crown")
                    case "expand":       return ("经略扩张", ["mubing", "seaopen", "jungong", "navyAct"], "military")
                    default:             return ("格物兴科", ["keju", "secular", "free", "parliament", "audit"], "council")
                    }
                }()
                let targetSet = Set(spec.reforms)
                for held in Regimes.heldReforms(r, id) where Regimes.independentReformIds.contains(held.id) && !targetSet.contains(held.id) {
                    Regimes.setReform(r, id, held, on: false)
                }
                b.strategy = JS(desiredPreset)
                b.powerBias = JS(spec.bias)
                b.strategyCooldownUntil = JS(ctx.day + 240)
                b.aiStrategyLockUntil = JS(ctx.day + 300)
                let cap = Regimes.maxIndependentReforms(r, id)
                var usedIndep = 0
                var applied = [String]()
                for rid in spec.reforms {
                    guard let f = Regimes.reforms.first(where: { $0.id == rid }) else { continue }
                    if let allowedPol = f.polities, !allowedPol.contains(p.polity) { continue }
                    if Regimes.independentReformIds.contains(rid) {
                        if usedIndep >= cap { continue }
                        usedIndep += 1
                    }
                    Regimes.setReform(r, id, f, on: true)
                    applied.append(f.name)
                }
                let maker = p.fullDecisionMaker
                recordCourtDecision(
                    r,
                    nationId: id,
                    category: "方略",
                    decisionMaker: maker,
                    title: "确立「\(spec.title)」治国大战略",
                    detail: "\(maker)（\(p.briefSignature)·\(p.archetype.rawValue)）审度时势，改定「\(spec.title)」总方略，统筹颁行\(applied.joined(separator: "、"))。"
                )
                _ = People.recordHistory(
                    r, kind: "reform",
                    text: "\(ctx.name)改定「\(spec.title)」治国方略",
                    reason: "\(maker)主导大政转轨，颁行\(applied.joined(separator: "、"))。",
                    nations: [id], province: ctx.capitalPid
                )
            } else {
                // 保持当前战略但设置防抖锁，阻止旧版通用逻辑覆盖
                b.aiStrategyLockUntil = JS(ctx.day + 180)
            }
        }

        // 3. 税制（轻徭薄赋 / 常税 / 重税）动态调配（180 日冷却）
        let taxCd = b.aiTaxCooldownUntil.optionalNumber.map(Int.init) ?? 0
        if ctx.day >= taxCd {
            let curTax = Finance.policy(r, id).key
            let desiredTax: String = {
                if ctx.atWar && ctx.gold < ctx.monthlyIncome * 2.5 && p.archetype != .benevolent && !tags.contains("benevolent") {
                    return "heavy"
                }
                if !ctx.atWar && (ctx.destiny < 48 || ctx.stability < 48 || (p.archetype == .benevolent && ctx.gold >= ctx.monthlyIncome * 4.5)) {
                    return "light"
                }
                return "normal"
            }()
            if desiredTax != curTax {
                if r.regimes.tax.isNull { r.regimes.tax = JS.object() }
                r.regimes.tax[id] = JS(desiredTax)
                b.aiTaxCooldownUntil = JS(ctx.day + 180)
                let label = Finance.policies.first(where: { $0.key == desiredTax })?.name ?? desiredTax
                let maker = p.fullDecisionMaker
                let why = desiredTax == "heavy" ? "战事军需吃紧，暂行重税筹饷" : desiredTax == "light" ? "休养生息、纾解民困与提振国运" : "岁收渐趋平稳，恢复常税稳固财源"
                recordCourtDecision(
                    r,
                    nationId: id,
                    category: "方略",
                    decisionMaker: maker,
                    title: "改行「\(label)」税制",
                    detail: "\(maker)（\(p.briefSignature)）因\(why)，诏令全国税制调整为「\(label)」。"
                )
            }
        }

        // 4. 央地集权三档（高度集权 / 郡县均衡 / 藩镇自治）动态调配（180 日冷却）
        let centCd = b.centralCooldownUntil.optionalNumber.map(Int.init) ?? 0
        if ctx.day >= centCd && ctx.key % 6 == 0 {
            let curCent = b.centralization.optionalString ?? "balanced"
            let desiredCent: String = {
                if (p.archetype == .autocrat || p.archetype == .militarist || tags.contains("ironfist") || ctx.camp == .authoritarian) && ctx.stability >= 58 && ctx.corruption < 34 {
                    return "central"
                }
                if (ctx.provinceCount >= 14 && (ctx.stability < 48 || ctx.corruption >= 40)) || p.styleId == "federal" || p.styleId == "confederation" || p.styleId == "feudal" {
                    return "autonomous"
                }
                return "balanced"
            }()
            if desiredCent != curCent {
                b.centralization = JS(desiredCent)
                b.centralCooldownUntil = JS(ctx.day + 180)
                let label = desiredCent == "central" ? "高度集权" : desiredCent == "autonomous" ? "藩镇自治" : "郡县均衡"
                let maker = p.fullDecisionMaker
                recordCourtDecision(
                    r,
                    nationId: id,
                    category: "方略",
                    decisionMaker: maker,
                    title: "调整央地体制为「\(label)」",
                    detail: "\(maker)（\(p.briefSignature)）审度疆域负荷与政局安定，改行「\(label)」央地治理体制。"
                )
            }
        }
    }

    // MARK: - Subsystem (C2): 26 项国策政令自动颁行

    private static func enactAutonomousDecree(_ r: JS, ctx: NationContext) {
        let id = ctx.id
        let b = Regimes.book(r, id)
        let aiCd = b.aiDecreeCooldownUntil.optionalNumber.map(Int.init) ?? 0
        guard ctx.day >= aiCd else { return }

        // 检查本季 2 道诏令额度
        let qKey = ctx.day / 90
        let used = (b.edictQuarterKey.optionalNumber.map(Int.init) == qKey)
            ? (b.edictQuarterUsed.optionalNumber.map(Int.init) ?? 0) : 0
        guard used < 2 else { return }

        let fin = r.finance.nations[id]
        let gold = fin.isNull ? 0 : (fin.gold.optionalNumber ?? 0)
        let p = ctx.profile
        let tags = ctx.traitsNormalized

        func canAffordAndReady(_ kind: String, cost: Double, reserveMult: Double = 1.2) -> Bool {
            if cost > 0 && gold < cost + ctx.monthlyIncome * reserveMult { return false }
            let until = b.decreeCooldowns.isNull ? 0 : (b.decreeCooldowns[kind].optionalNumber.map(Int.init) ?? 0)
            return ctx.day >= until
        }

        // 按最高执政者属性、人格与实时危局挑选最急需的一道政令
        var candidates: [(kind: String, label: String, score: Double, why: String)] = []

        // 1. 反腐清吏（腐化 > 28 且政务达标，或腐化爆表）
        if ctx.corruption > 28 && (p.administrative >= 55 || p.archetype == .reformer || p.archetype == .autocrat || ctx.corruption >= 40) && canAffordAndReady("antiCorruption", cost: 180) {
            let sc = 58.0 + (ctx.corruption - 28.0) * 1.6 + Double(p.administrative) * 0.25 + (tags.contains("ironfist") || tags.contains("reformer") ? 14 : 0)
            candidates.append(("antiCorruption", "整顿吏治", sc, "吏治腐化攀升至 \(Int(ctx.corruption))，急遣钦差肃清贪墨"))
        }

        // 2. 战时军备/动员/劳军/军债
        if ctx.atWar {
            if ctx.avgMorale < 66 && canAffordAndReady("rewardArmies", cost: 200, reserveMult: 0.5) {
                candidates.append(("rewardArmies", "犒赏三军", 82.0 + (70 - ctx.avgMorale), "前线士气低迷，急拨军帑劳军振作三军"))
            }
            if ctx.warStatus == .losing && ctx.myTroops < max(8000, Int(Double(ctx.enemyTroops) * 0.85)) && canAffordAndReady("mobilize", cost: 140, reserveMult: 0.2) {
                candidates.append(("mobilize", "全国大征兵", 86.0 + Double(p.military) * 0.2, "强敌压境、兵力告急，紧急编练新军驰援前线"))
            }
            if ctx.warStatus == .losing && gold < 130 && canAffordAndReady("warBond", cost: 0, reserveMult: 0) {
                candidates.append(("warBond", "举债筹饷", 78.0, "战时国库见底，急发军饷公债力保前线不溃"))
            }
            if canAffordAndReady("armsUpgrade", cost: 260, reserveMult: 1.0) && (p.archetype == .militarist || p.archetype == .conqueror || p.military >= 68) {
                candidates.append(("armsUpgrade", "军械改良", 64.0 + Double(p.military) * 0.3, "更新三军甲胄兵刃、整补战损以夺胜势"))
            }
            if canAffordAndReady("eliteDrill", cost: 220, reserveMult: 1.2) && (p.archetype == .militarist || tags.contains("martial")) {
                candidates.append(("eliteDrill", "大阅禁军", 60.0 + Double(p.military) * 0.28, "校阅常备军阵法、锤炼百战精锐历练"))
            }
            if canAffordAndReady("fortifyBorder", cost: 220, reserveMult: 1.0) {
                candidates.append(("fortifyBorder", "加固边防", 62.0 + (ctx.warStatus == .losing ? 18 : 0), "抢修边塞重镇城垣以御强敌"))
            }
            if let cmd = Regimes.activeCommander(r, nation: id, enemy: nil), cmd.military < 86, canAffordAndReady("promoteCommander", cost: 200, reserveMult: 1.0) {
                candidates.append(("promoteCommander", "敕封名将", 58.0 + Double(p.military) * 0.22, "御赐节钺嘉奖在阵统帅\(cmd.name)，激励三军死战"))
            }
        }

        // 3. 战败震荡安抚与民生赈灾
        if ctx.defeatShock >= 0.14 && canAffordAndReady("grandFeast", cost: 200, reserveMult: 0.8) {
            candidates.append(("grandFeast", "大酺庆典", 76.0, "战后震荡未平，敕赐大酺抚慰朝野、重振民心"))
        }
        if (ctx.destiny < 50 || ctx.stability < 48) && canAffordAndReady("taxRelief", cost: 160, reserveMult: 0.8) {
            let sc = 66.0 + (55.0 - ctx.destiny) + (p.archetype == .benevolent ? 16 : 0)
            candidates.append(("taxRelief", "减赋安民", sc, "民心承压，蠲免苛捐以稳固社稷国运"))
        }
        if !ctx.atWar && canAffordAndReady("prosper", cost: 180, reserveMult: 1.8) && (p.archetype == .benevolent || p.archetype == .scholarly || ctx.destiny < 65) {
            candidates.append(("prosper", "休养生息", 56.0 + Double(p.charisma) * 0.2, "承平之际劝课农桑、充盈粮仓以滋生丁口"))
        }
        if !ctx.atWar && canAffordAndReady("roadNetwork", cost: 240, reserveMult: 2.2) && (p.archetype == .mercantile || p.archetype == .reformer || p.archetype == .scholarly) {
            candidates.append(("roadNetwork", "交通基建", 55.0 + Double(p.administrative) * 0.24, "大兴全国驰道驿路，畅通商旅与粮运"))
        }
        if !ctx.atWar && canAffordAndReady("granary", cost: 180, reserveMult: 1.8) && (p.archetype == .benevolent || tags.contains("cautious")) {
            candidates.append(("granary", "战略粮储", 54.0 + Double(p.administrative) * 0.18, "广设常平义仓积谷防荒"))
        }

        // 4. 海运船坞、文教科研、外交修好、广纳奇才与巡狩清丈
        if ctx.portCount >= 1 && canAffordAndReady("navalDockyard", cost: 240, reserveMult: 1.6) && (ctx.isIsland || p.archetype == .mercantile || tags.contains("maritime")) {
            candidates.append(("navalDockyard", "海运船坞", 58.0 + (ctx.isIsland ? 16 : 0), "扩充跨海运输船队并修缮水师船体"))
        }
        if !ctx.atWar && canAffordAndReady("academy", cost: 200, reserveMult: 2.0) && (p.archetype == .scholarly || p.archetype == .reformer) {
            candidates.append(("academy", "兴办太学", 56.0 + Double(p.administrative) * 0.22, "兴办国立学馆、精进中枢治政与外交才干"))
        }
        if !ctx.atWar && canAffordAndReady("techAcademy", cost: 260, reserveMult: 2.2) && (p.archetype == .reformer || p.archetype == .militarist) {
            candidates.append(("techAcademy", "格物兴科", 54.0 + Double(p.military + p.administrative) * 0.12, "资助国家科研院革新工械兵法"))
        }
        if !ctx.atWar && canAffordAndReady("scholarlyEdict", cost: 160, reserveMult: 1.8) && (WorldDepth.reputation(r, nation: id) < 72 || p.archetype == .diplomat || p.archetype == .scholarly) {
            candidates.append(("scholarlyEdict", "开馆修史", 53.0 + Double(p.diplomatic) * 0.22, "开馆修史彰明法统，抬升国际信誉与国运"))
        }
        if !ctx.atWar && canAffordAndReady("envoyGoodwill", cost: 200, reserveMult: 2.0) && (p.archetype == .diplomat || tags.contains("diplomatic")) {
            candidates.append(("envoyGoodwill", "遣使修好", 58.0 + Double(p.diplomatic) * 0.25, "遣使四方广结善邻，营造和睦外围环境"))
        }
        if ctx.corruption >= 32 && canAffordAndReady("imperialInspection", cost: 180, reserveMult: 1.4) && (p.archetype == .autocrat || p.archetype == .conqueror) {
            candidates.append(("imperialInspection", "巡狩省方", 60.0 + Double(p.charisma) * 0.2, "亲巡诸州震慑豪强、考核官吏"))
        }
        if ctx.corruption >= 34 && gold < 260 && canAffordAndReady("landSurvey", cost: 0, reserveMult: 0) && (p.archetype == .autocrat || p.archetype == .reformer) {
            candidates.append(("landSurvey", "清丈田亩", 62.0, "清查豪强隐田、均平税负并速充国库"))
        }
        if !ctx.atWar && gold >= 650 && canAffordAndReady("recruitTalent", cost: 260, reserveMult: 2.5) {
            candidates.append(("recruitTalent", "广纳奇才", 52.0 + Double(p.charisma) * 0.18, "厚礼遍访草泽，延揽高才名将与能相入朝"))
        }

        guard let top = candidates.max(by: { $0.score < $1.score }), top.score >= 52 else {
            b.aiDecreeCooldownUntil = JS(ctx.day + 60)
            return
        }

        let res = Regimes.executeCoreDecree(r, nationId: id, kind: top.kind, fromAI: true)
        if res.ok {
            b.aiDecreeCooldownUntil = JS(ctx.day + 120)
            let maker = p.fullDecisionMaker
            recordCourtDecision(
                r,
                nationId: id,
                category: "诏令",
                decisionMaker: maker,
                title: "颁行「\(top.label)」政令",
                detail: "\(maker)（\(p.briefSignature)）鉴于\(top.why)，下令施行「\(top.label)」：\(res.reason)"
            )
        } else {
            b.aiDecreeCooldownUntil = JS(ctx.day + 45)
        }
    }

    // MARK: - Subsystem (D): 天下奇观与国家大工程自动竞建

    /// 供 `GrandSystems.month` 或 `SovereignAI.month` 调用（月内自动去重）。
    public static func considerGrandWonderIfNeeded(_ r: JS, nation n: JS, id: String, key: Int) {
        guard UnitKinds.enabled, !r.regimes.isNull, r.regimes.enabled.isTruthy else { return }
        guard Regimes.isAutoGoverned(r, id) else { return }
        if let c = activeCache(r), c.handledWonderMonth.contains(id) { return }
        let ctx = makeContext(r, nation: n, id: id, key: key)
        considerGrandWonder(r, ctx: ctx)
    }

    private static func considerGrandWonder(_ r: JS, ctx: NationContext) {
        let id = ctx.id
        if let c = activeCache(r) {
            guard c.handledWonderMonth.insert(id).inserted else { return }
        }
        // 每季检查一次（或国库丰厚时每月检查）
        guard ctx.key % 3 == 0 || ctx.gold >= 900 else { return }
        guard ctx.warStatus != .losing, ctx.provinceCount >= 2 else { return }
        if r.regimes.wonders.isNull { r.regimes.wonders = JS.object() }

        let cache = activeCache(r)
        if let c = cache {
            if c.buildingWonderNations.contains(id) { return }
        } else {
            for (_, row) in r.regimes.wonders.objectEntries {
                if row.status.optionalString == "building", row.builderId.optionalString == id { return }
            }
        }

        let taken = cache?.takenWonders ?? Set(r.regimes.wonders.objectKeys)
        let myProvs = Regimes.monthLand(r, id)
        guard !myProvs.isEmpty else { return }
        let portSet = cache?.portPids ?? Set((Naval.sea?.ports ?? []).map(\.provinceId))
        let myPorts = cache?.portsByNation[id] ?? myProvs.filter { portSet.contains($0.id.asString) }
        let p = ctx.profile
        let tags = ctx.traitsNormalized

        var best: (spec: GrandSystems.WonderSpec, score: Double, why: String)?
        for spec in GrandSystems.wonders {
            if taken.contains(spec.id) { continue }
            if spec.coastalOnly && myPorts.isEmpty { continue }
            // 按收入与造价动态判定门槛：gold >= max(450, cost * 0.65)，且要么现金全额覆盖、要么 3 个月岁入可补足
            let minCash = max(450.0, spec.cost * 0.65)
            guard ctx.gold >= minCash && (ctx.gold >= spec.cost || ctx.gold + ctx.monthlyIncome * 3.0 >= spec.cost) else { continue }

            var sc = 40.0
            var why = "树千秋不朽丰碑、光耀社稷"
            switch spec.id {
            case "greatWall":
                sc += Double(p.military) * 0.40 + Double(cache?.borderPidsByNation[id]?.count ?? 2) * 4.0
                if p.archetype == .militarist || p.archetype == .benevolent || p.archetype == .autocrat { sc += 22 }
                why = "锁钥边疆重险、铸就万里不拔防线"
            case "imperialArsenal":
                sc += Double(p.military) * 0.55 + (ctx.atWar ? 18 : 0)
                if p.archetype == .militarist || p.archetype == .conqueror || tags.contains("martial") { sc += 26 }
                why = "汇聚天下巧匠铸甲造炮、令全军兵锋所向披靡"
            case "steppeStud":
                sc += Double(p.military) * 0.45
                if p.archetype == .conqueror || p.archetype == .militarist || ctx.camp == .tribal { sc += 24 }
                why = "精选良驹广育铁骑、增强野战奔袭锐气"
            case "forbiddenPalace":
                sc += Double(p.charisma + p.administrative) * 0.30
                if p.archetype == .conqueror || p.archetype == .autocrat || ctx.camp == .monarchy { sc += 24 }
                why = "重檐宏殿镇压四极、彰明中枢正统与万邦威仪"
            case "grandAcademy":
                sc += Double(p.administrative) * 0.55 + (ctx.corruption >= 25 ? 12 : 0)
                if p.archetype == .scholarly || p.archetype == .reformer || tags.contains("scholar") || tags.contains("reformer") { sc += 28 }
                why = "广纳海内硕儒格物致知、加速四线科技并清肃吏治"
            case "imperialObservatory":
                sc += Double(p.administrative + p.diplomatic) * 0.28
                if p.archetype == .scholarly || p.archetype == .reformer || p.archetype == .mercantile { sc += 22 }
                why = "推步历象测绘山海、引领大航海与近代军工"
            case "heavenAltar":
                sc += Double(p.charisma) * 0.42 + (ctx.stability < 55 ? 18 : 0)
                if p.archetype == .benevolent || ctx.camp == .theocracy { sc += 26 }
                why = "祭天祈年凝聚礼法、长保社稷安稳与国运昌隆"
            case "silkExchange":
                sc += Double(p.diplomatic + p.administrative) * 0.30
                if p.archetype == .mercantile || p.archetype == .diplomat || tags.contains("financier") || ctx.camp == .republic { sc += 28 }
                why = "汇聚东西百货金银、广开万邦商贸税源"
            case "grandCanal":
                sc += Double(p.administrative) * 0.42 + Double(min(12, ctx.provinceCount)) * 2.5
                if p.archetype == .mercantile || p.archetype == .scholarly || p.archetype == .reformer { sc += 24 }
                why = "贯通南北水系转漕京畿、大幅提振全国岁入与丁口"
            case "everNormalVault":
                sc += Double(p.charisma + p.administrative) * 0.28
                if p.archetype == .benevolent || tags.contains("benevolent") { sc += 26 }
                why = "丰岁籴谷凶年赈济、护佑万民安居无饥馑之忧"
            case "royalShipyard":
                sc += Double(p.military + p.diplomatic) * 0.28 + (ctx.isIsland ? 26 : Double(min(4, ctx.portCount)) * 5.0)
                if p.archetype == .mercantile || p.archetype == .conqueror || tags.contains("maritime") { sc += 28 }
                why = "巨舰楼船连舻下水、纵横大洋大幅增强跨海运力"
            case "greatLighthouse":
                sc += Double(p.diplomatic) * 0.40 + (ctx.isIsland ? 20 : Double(min(4, ctx.portCount)) * 4.5)
                if p.archetype == .mercantile || p.archetype == .diplomat || tags.contains("maritime") { sc += 26 }
                why = "彻夜照耀远洋航道、护佑海贸商舶与归航水师"
            default:
                break
            }

            sc += Double(Regimes.draw("\(id)|\(ctx.key)|wonder|\(spec.id)") % 40) / 10.0
            if best.map({ sc > $0.score }) ?? true {
                best = (spec, sc, why)
            }
        }

        guard let pick = best else { return }
        // 择最优奠基州郡（海权奇观择良港，边城择边境重镇，其余择都城或人口最盛州）
        let sitePool = pick.spec.coastalOnly ? myPorts : myProvs
        let borderSet = cache?.borderPidsByNation[id] ?? []
        let site: JS? = {
            if pick.spec.id == "greatWall", let bp = sitePool.first(where: { borderSet.contains($0.id.asString) }) { return bp }
            if let cap = ctx.capitalPid, let cp = sitePool.first(where: { $0.id.asString == cap }) { return cp }
            return sitePool.max {
                (Regimes.monthStock(r, $0.id.asString)?.population.optionalNumber ?? 0)
                    < (Regimes.monthStock(r, $1.id.asString)?.population.optionalNumber ?? 0)
            } ?? sitePool.first
        }()
        guard let site else { return }

        let fin = r.finance.nations[id]
        let curGold = fin.isNull ? 0 : (fin.gold.optionalNumber ?? 0)
        // 实扣工程专款（现金足则全额扣除，现金处于 65%–100% 档位时按 85% 首付立项，不留负数）
        let downPayment = curGold >= pick.spec.cost ? pick.spec.cost : (curGold * 0.85).rounded()
        if !fin.isNull { fin.gold = JS(max(0, curGold - downPayment)) }

        let row = JS.object()
        row.status = JS("building")
        row.builderId = JS(id)
        row.provinceId = JS(site.id.asString)
        row.progress = JS(0)
        row.totalMonths = JS(pick.spec.months)
        row.startedDay = r.world.day.clone()
        r.regimes.wonders[pick.spec.id] = row
        cache?.takenWonders.insert(pick.spec.id)
        cache?.buildingWonderNations.insert(id)

        let maker = p.fullDecisionMaker
        let siteName = site.name.asString
        recordCourtDecision(
            r,
            nationId: id,
            category: "工程",
            decisionMaker: maker,
            title: "动工兴建奇观「\(pick.spec.name)」",
            detail: "\(maker)（\(p.briefSignature)）志在\(pick.why)，敕拨专款 \(Int(downPayment)) 金于\(siteName)奠基动工「\(pick.spec.name)」（工期 \(pick.spec.months) 月，\(pick.spec.effectLine)）。"
        )
        _ = People.announce(
            r, kind: "event",
            text: "\(ctx.name)动工兴建奇观「\(pick.spec.name)」",
            reason: "\(maker)批示于\(siteName)大兴土木（斥资 \(Int(downPayment)) 金），预计 \(pick.spec.months) 个月竣工（\(pick.spec.effectLine)）。",
            nations: [id], province: site.id.asString
        )
    }

    // MARK: - Subsystem (E): 国家霸业使命自动领赏与黄金盛世自动开启

    private static func claimMissionsAndGoldenAge(_ r: JS, ctx: NationContext) {
        let id = ctx.id
        let p = ctx.profile
        let maker = p.fullDecisionMaker

        // 1. 每月自动评估全部 8 项霸业使命，达成即立刻领赏（绝不让奖励闲置！）
        let progress = GrandSystems.evaluateMissions(r, nationId: id)
        var claimedCount = 0
        for mp in progress {
            if mp.claimed {
                claimedCount += 1
                continue
            }
            if mp.done {
                let res = GrandSystems.claimMission(r, nationId: id, missionId: mp.spec.id)
                if res.ok {
                    claimedCount += 1
                    recordCourtDecision(
                        r,
                        nationId: id,
                        category: "方略",
                        decisionMaker: maker,
                        title: "功成霸业「\(mp.spec.title)」领赏",
                        detail: "\(maker)（\(p.briefSignature)）宣诏告成「\(mp.spec.title)」（\(mp.statusLine)），全额兑现国赏：\(mp.spec.rewardText)。"
                    )
                }
            }
        }

        // 2. 自动择机开启 5 年国家黄金盛世
        let gaLeft = GrandSystems.goldenAgeRemaining(r, nationId: id)
        let gaCD = GrandSystems.goldenAgeCooldownRemaining(r, nationId: id)
        guard gaLeft == 0 && gaCD == 0 else { return }

        let ownedWonders = activeCache(r)?.wondersOwnedByNation[id] ?? GrandSystems.controlledWonders(r, nationId: id).count
        let eligible = Int(ctx.destiny.rounded()) >= 68 || claimedCount >= 2 || ownedWonders >= 1
        guard eligible else { return }

        // 战略择时：大胜期 / 奇观建成 / 盛世国运高涨 / 完成 3+ 霸业 / 铁血雄主战时冲锋
        let goodTiming = (ctx.warStatus == .winning)
            || (ownedWonders >= 1 && ctx.stability >= 52)
            || (ctx.destiny >= 74 && ctx.stability >= 56)
            || (claimedCount >= 3)
            || (ctx.atWar && ctx.destiny >= 70 && (p.archetype == .conqueror || p.archetype == .militarist))
        guard goodTiming else { return }

        let gaRes = GrandSystems.startGoldenAge(r, nationId: id)
        if gaRes.ok {
            let reason = ctx.warStatus == .winning ? "趁大军连捷乘势鼓舞全国士气" : ownedWonders >= 1 ? "藉奇观落成、声威鼎盛之机诏启盛世" : "国运昌隆、百业俱兴，顺势开启五年黄金盛世"
            recordCourtDecision(
                r,
                nationId: id,
                category: "方略",
                decisionMaker: maker,
                title: "诏启五年「黄金盛世」",
                detail: "\(maker)（\(p.briefSignature)）\(reason)：未来 60 个月岁入 +25%、全军攻 +16% 守 +14%、安定 +15、腐化 −10！"
            )
        }
    }

    // MARK: - Subsystem (F): 战时雇佣兵团紧急招募与四海古迹远征

    private static func handleWartimeAndExpeditions(_ r: JS, ctx: NationContext) {
        let id = ctx.id
        let p = ctx.profile
        let maker = p.fullDecisionMaker
        let fin = r.finance.nations[id]
        guard !fin.isNull else { return }
        let gold = fin.gold.optionalNumber ?? 0

        // 1. 战时受威胁时自动招募匹配执政者兵学偏好的传世雇佣兵团
        if ctx.atWar && (ctx.warStatus == .losing || ctx.lostCount >= 1 || ctx.myTroops < max(6000, Int(Double(ctx.enemyTroops) * 0.90))) {
            let milTech = WorldDepth.techLevel(r, nation: id, branch: .military)
            let nowDay = ctx.day
            var bestMerc: (spec: GrandSystems.MercSpec, score: Double)?
            for m in GrandSystems.mercenaries {
                guard gold >= m.cost + 80 else { continue }
                let cdUntil = (!r.regimes.mercCooldown.isNull && !r.regimes.mercCooldown[id].isNull)
                    ? (r.regimes.mercCooldown[id][m.id].optionalNumber.map(Int.init) ?? 0) : 0
                guard nowDay >= cdUntil else { continue }
                var sc = Double(m.xp) + Double(m.troops) / 200.0
                switch m.id {
                case "thunderCorps":
                    if milTech >= 3 || p.archetype == .reformer || p.archetype == .scholarly { sc += 25 }
                case "xuanjia", "mamlukGuard":
                    if p.archetype == .conqueror || ctx.camp == .tribal { sc += 22 }
                case "varangian":
                    if p.archetype == .militarist || p.archetype == .autocrat || p.military >= 70 { sc += 24 }
                case "swissPike", "venetianXbow":
                    if p.archetype == .benevolent || p.archetype == .mercantile || ctx.lostCount >= 1 { sc += 22 }
                default: break
                }
                if bestMerc.map({ sc > $0.score }) ?? true { bestMerc = (m, sc) }
            }
            if let pick = bestMerc {
                let res = GrandSystems.hireMercenary(r, nationId: id, mercId: pick.spec.id)
                if res.ok {
                    recordCourtDecision(
                        r,
                        nationId: id,
                        category: "军备",
                        decisionMaker: maker,
                        title: "重金招募「\(pick.spec.name)」",
                        detail: "\(maker)（\(p.briefSignature)）见前线吃紧，立拨 \(Int(pick.spec.cost)) 金紧急雇佣「\(pick.spec.name)」（\(pick.spec.troops) 百战精锐）驰援战局。"
                    )
                }
            }
        }

        // 2. 和平或顺风且财政充裕时，主动派遣远征队探索天下古迹秘境
        guard !ctx.atWar || ctx.warStatus == .winning else { return }
        guard ctx.key % 2 == 0 else { return }
        let curGold = fin.gold.optionalNumber ?? 0
        guard curGold >= 320 else { return }

        let cache = activeCache(r)
        if let c = cache {
            if c.exploringNations.contains(id) { return }
        } else if !r.regimes.expeditions.isNull {
            for (_, row) in r.regimes.expeditions.objectEntries {
                if row.status.optionalString == "exploring", row.explorerId.optionalString == id { return }
            }
        }

        let takenExp = cache?.takenExpeditions ?? Set(r.regimes.expeditions.isNull ? [] : r.regimes.expeditions.objectKeys)
        var bestSite: (site: GrandSystems.ExpeditionSite, score: Double)?
        for site in GrandSystems.expeditions {
            guard !takenExp.contains(site.id) else { continue }
            guard curGold >= max(320.0, site.cost * 1.8) else { continue }
            var sc = 40.0
            switch site.techBranch {
            case .naval:
                if ctx.portCount == 0 { sc -= 24 }
                else { sc += (ctx.isIsland ? 26 : 14) + (p.archetype == .mercantile ? 18 : 0) }
            case .military:
                sc += Double(p.military) * 0.30 + ((p.archetype == .conqueror || p.archetype == .militarist) ? 18 : 0)
            case .economy:
                sc += Double(p.administrative + p.diplomatic) * 0.16 + ((p.archetype == .mercantile || p.archetype == .diplomat) ? 18 : 0)
            case .statecraft:
                sc += Double(p.administrative) * 0.30 + ((p.archetype == .scholarly || p.archetype == .reformer) ? 18 : 0)
            }
            sc += Double(Regimes.draw("\(id)|\(ctx.key)|exp|\(site.id)") % 30) / 10.0
            if bestSite.map({ sc > $0.score }) ?? true { bestSite = (site, sc) }
        }

        if let pick = bestSite {
            let res = GrandSystems.dispatchExpedition(r, nationId: id, siteId: pick.site.id)
            if res.ok {
                cache?.takenExpeditions.insert(pick.site.id)
                cache?.exploringNations.insert(id)
                recordCourtDecision(
                    r,
                    nationId: id,
                    category: "工程",
                    decisionMaker: maker,
                    title: "派遣远征队探索「\(pick.site.name)」",
                    detail: "\(maker)（\(p.briefSignature)）拨款 \(Int(pick.site.cost)) 金遣队远征「\(pick.site.name)」（\(pick.site.regionKind)），预计 \(pick.site.months) 个月凯旋（\(pick.site.rewardLine)）。"
                )
            }
        }
    }

    // MARK: - Subsystem (G): 工业动员、核反应堆建设与战略核威慑

    private static func manageNuclearAndIndustry(_ r: JS, ctx: NationContext) {
        let id = ctx.id
        let p = ctx.profile
        let maker = p.fullDecisionMaker
        let b = Regimes.book(r, id)
        NuclearWarfare.ensureInitialized(r)

        let tension = NuclearWarfare.worldTension(r)
        let curLaw = NuclearWarfare.mobilization(r, nationId: id)

        // 1. 战时自动上调工业动员法案，和平时期自动回调民用/早期动员以养民息兵
        let mobCd = b.aiMobCooldownUntil.optionalNumber.map(Int.init) ?? 0
        if ctx.day >= mobCd {
            let desiredLaw: NuclearWarfare.MobilizationLaw = {
                if ctx.atWar {
                    let existential = ctx.warStatus == .losing || ctx.lostCount >= 2
                    let aggressive = (p.archetype == .militarist || p.archetype == .autocrat || p.archetype == .conqueror) && tension >= 60
                    return (existential || aggressive) ? .total : .warEconomy
                }
                if tension >= 68 && (p.archetype == .militarist || p.archetype == .conqueror || p.archetype == .autocrat) {
                    return .early
                }
                if ctx.gold < ctx.monthlyIncome * 4.0 || p.archetype == .mercantile || p.archetype == .benevolent {
                    return .civilian
                }
                return .early
            }()
            if desiredLaw != curLaw {
                let res = NuclearWarfare.setMobilization(r, nationId: id, level: desiredLaw.rawValue)
                if res.ok {
                    b.aiMobCooldownUntil = JS(ctx.day + 180)
                    let why = ctx.atWar ? "战火炽烈，急需提高军工产能与前线战力" : "时局缓和，调整经济体制以休养生息、充盈国库"
                    recordCourtDecision(
                        r,
                        nationId: id,
                        category: "方略",
                        decisionMaker: maker,
                        title: "切换动员体制为「\(desiredLaw.label)」",
                        detail: "\(maker)（\(p.briefSignature)）\(why)：\(res.text)"
                    )
                }
            }
        }

        // 2. 核时代（1943 年后/现代）超级工业大国才具备自主核反应堆建设计划，杜绝 1941 或中小农业国泛滥拥核
        guard NuclearWarfare.isNuclearCapable(r, nationId: id) else { return }
        let curReactors = NuclearWarfare.reactors(r, nationId: id)
        let reactorCd = b.aiReactorCooldownUntil.optionalNumber.map(Int.init) ?? 0
        let icVal = NuclearWarfare.ic(r, nationId: id)
        guard icVal >= 175.0 else { return }
        let desiredReactors = icVal >= 280.0 ? 3 : (icVal >= 210.0 ? 2 : 1)
        if curReactors < desiredReactors && curReactors < 5 && ctx.day >= reactorCd {
            let cost = NuclearWarfare.reactorCost(currentReactors: curReactors)
            let reserve = max(1400.0, ctx.monthlyIncome * 4.0)
            if ctx.gold >= cost + reserve {
                let res = NuclearWarfare.buildReactor(r, nationId: id)
                if res.ok {
                    b.aiReactorCooldownUntil = JS(ctx.day + 360)
                    recordCourtDecision(
                        r,
                        nationId: id,
                        category: "工程",
                        decisionMaker: maker,
                        title: "投建第 \(curReactors + 1) 座核反应堆",
                        detail: "\(maker)（\(p.briefSignature)）启动国家最高机密核工程，斥资 \(Int(cost)) 金建设核设施：\(res.text)"
                    )
                }
            }
        }

        // 3. 存亡危局或高紧张度全面战争下的战略核威慑打击
        let nukeCount = NuclearWarfare.nukes(r, nationId: id)
        guard nukeCount >= 1 && ctx.atWar else { return }
        let nukeCd = b.aiNukeCooldownUntil.optionalNumber.map(Int.init) ?? 0
        guard ctx.day >= nukeCd else { return }

        let capitalLost: Bool = {
            guard let capPid = ctx.capitalPid else { return false }
            let capCtrl = r.world.provinces.asArray.first(where: { $0.id.asString == capPid })?.controller.optionalString
            return capCtrl != nil && capCtrl != id
        }()
        let existentialCrisis = (ctx.warStatus == .losing && (ctx.lostCount >= 2 || capitalLost))
        let totalWarEscalation = (tension >= 85.0 && NuclearWarfare.mobilization(r, nationId: id) == .total && ctx.warStatus != .winning
            && (p.archetype == .autocrat || p.archetype == .militarist || ctx.traitsNormalized.contains("cruel")))
        guard existentialCrisis || totalWarEscalation else { return }

        let enemies = Set(activeCache(r)?.enemiesByNation[id] ?? {
            var out = [String]()
            for rel in r.world.statecraft.relations.asArray where rel.status.optionalString == "war" {
                if rel.a.optionalString == id, let other = rel.b.optionalString { out.append(other) }
                else if rel.b.optionalString == id, let other = rel.a.optionalString { out.append(other) }
            }
            return out
        }())
        guard !enemies.isEmpty else { return }

        // 选定敌军兵力最密集且尚未受核辐射污染的敌控核心州实施核打击
        var troopsByPid = [String: Int]()
        for a in r.world.armies.asArray where a.troops.asNumber > 0 && a.status.asString != "destroyed" {
            if let nid = a.nationId.optionalString, enemies.contains(nid), let pid = a.provinceId.optionalString {
                troopsByPid[pid, default: 0] += a.troops.asInt
            }
        }
        var bestTarget: (index: Int, score: Double)?
        for (idx, prov) in r.world.provinces.asArray.enumerated() {
            guard let ctrl = prov.controller.optionalString, enemies.contains(ctrl) else { continue }
            let pid = prov.id.asString
            if NuclearWarfare.falloutMonths(r, provinceId: pid) > 0 { continue }
            let troopWeight = Double(troopsByPid[pid] ?? 0) * 1.5
            let popWeight = (Regimes.monthStock(r, pid)?.population.optionalNumber ?? 0) * 0.04
            let capWeight = (activeCache(r)?.capitalPidByNation[ctrl] == pid) ? 3500.0 : 0.0
            let score = troopWeight + popWeight + capWeight
            if bestTarget.map({ score > $0.score }) ?? true {
                bestTarget = (idx, score)
            }
        }
        guard let target = bestTarget else { return }
        let strike = NuclearWarfare.nuclearStrike(r, attackerId: id, provinceIndex: target.index)
        if strike.ok {
            b.aiNukeCooldownUntil = JS(ctx.day + 180)
            let targetName = r.world.provinces[target.index].name.asString
            recordCourtDecision(
                r,
                nationId: id,
                category: "军备",
                decisionMaker: maker,
                title: "下令对\(targetName)实施战略核打击",
                detail: "\(maker)（\(p.briefSignature)）\(existentialCrisis ? "面对亡国危局动用终极战略威慑" : "于高烈度全面战争中下达核突击密令")：\(strike.text)"
            )
        }
    }
}

