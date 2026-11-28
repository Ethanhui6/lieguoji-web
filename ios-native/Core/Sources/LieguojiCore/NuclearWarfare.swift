import Foundation

/// v6.0.0 HOI4 战略体系（核武器 + 工业产能 IC + 战争支持度 + 全球紧张度 + 制空权 + 动员法案）：
/// 纯 Foundation 实现，100% 兼容 iOS 17+ 与 Linux Swift 5.10。
/// 数据统一保存在 `r.regimes.hoi4` 中；仅在 App 规则（`UnitKinds.enabled && r.regimes.enabled`）下演进，
/// 绝不干扰网页逐字节黄金对照测试。
public enum NuclearWarfare {

    // MARK: - 1. 工业动员法案

    public enum MobilizationLaw: String, CaseIterable, Sendable {
        case civilian   = "civilian"
        case early      = "early"
        case warEconomy = "war_economy"
        case total      = "total"

        public var label: String {
            switch self {
            case .civilian:   return "民用经济"
            case .early:      return "早期动员"
            case .warEconomy: return "战时经济"
            case .total:      return "全面总动员"
            }
        }

        public var note: String {
            switch self {
            case .civilian:   return "税+12% · 军产−10%"
            case .early:      return "民用与军产均衡"
            case .warEconomy: return "军产+25% · 攻+8% · 民用税−8%"
            case .total:      return "军产+45% · 攻防+14% · 民用税−18% · 耗安定"
            }
        }

        /// 月度民用税收增减比例
        public var taxBonus: Double {
            switch self {
            case .civilian:   return 0.12
            case .early:      return 0.0
            case .warEconomy: return -0.08
            case .total:      return -0.18
            }
        }

        /// 军事动员与军工产出倍率（用于征兵、军团上限与空军产能）
        public var milProdMult: Double {
            switch self {
            case .civilian:   return 0.90
            case .early:      return 1.00
            case .warEconomy: return 1.25
            case .total:      return 1.45
            }
        }

        /// 战场进攻加成（百分点）
        public var attackBonusPct: Double {
            switch self {
            case .civilian:   return 0.0
            case .early:      return 0.0
            case .warEconomy: return 8.0
            case .total:      return 14.0
            }
        }

        /// 战场防御加成（百分点）
        public var defenseBonusPct: Double {
            switch self {
            case .civilian:   return 0.0
            case .early:      return 0.0
            case .warEconomy: return 2.0
            case .total:      return 14.0
            }
        }

        /// 工业产能 IC 乘数修正
        public var icFactor: Double {
            switch self {
            case .civilian:   return 0.92
            case .early:      return 1.00
            case .warEconomy: return 1.18
            case .total:      return 1.32
            }
        }
    }

    // MARK: - 2. 初始化与只读查询工具

    private static func clamp(_ v: Double, _ lo: Double, _ hi: Double) -> Double {
        max(lo, min(hi, v.isFinite ? v : lo))
    }

    /// 建造下一座核反应堆的金币造价（`3200 + reactors * 2200`，仅工业大国可承担的曼哈顿级工程）。
    public static func reactorCost(currentReactors: Int) -> Double {
        Double(3200 + max(0, currentReactors) * 2200)
    }

    /// 读取某国的历史工业指数（来自 `r.regimes.historicalPower[nid].industryIndex`，普通世界默认 `1.0`）。
    public static func industryIndex(_ r: JS, nationId: String) -> Double {
        guard !r.regimes.isNull, !r.regimes.historicalPower.isNull else { return 1.0 }
        let row = r.regimes.historicalPower[nationId]
        guard !row.isNull, let v = row.industryIndex.optionalNumber, v.isFinite else { return 1.0 }
        return clamp(v, 0.22, 4.20)
    }

    /// 读取某国的历史兵源规模系数（来自 `r.regimes.historicalPower[nid].manpowerScale`，普通世界默认 `1.0`）。
    public static func manpowerScale(_ r: JS, nationId: String) -> Double {
        guard !r.regimes.isNull, !r.regimes.historicalPower.isNull else { return 1.0 }
        let row = r.regimes.historicalPower[nationId]
        guard !row.isNull, let v = row.manpowerScale.optionalNumber, v.isFinite else { return 1.0 }
        return clamp(v, 0.30, 3.00)
    }

    /// 严格核时代门控（v7.0 史实校准）：
    /// - 历史剧本中，公元 1943 年之前绝无核武器（彻底杜绝 1812 / 1914 / 1939 / 1941 开局人人有核）；
    /// - 1943 年及以后（含 1950 冷战），需达到超级大国级工业底盘与军工/农商高阶科技（或开局史实拥核）方可研发；
    /// - 普通架空世界需进入现代时代，或军备与农商科技双满 6 阶且具备雄厚工业产能（IC ≥ 160）。
    public static func isNuclearEra(_ r: JS, nationId: String) -> Bool {
        let era = HistoricalEra.current(r)
        let year = HistoricalEra.displayYear(r)
        let isHistorical = !r.regimes.isNull && !r.regimes.historicalScenarioId.isNull
        if isHistorical {
            guard year >= 1943 else { return false }
            if era == .antiquity || era == .medieval || era == .gunpowder || era == .ww1 { return false }
            if nukes(r, nationId: nationId) > 0 || reactors(r, nationId: nationId) > 0 { return true }
            let techMil = WorldDepth.techLevel(r, nation: nationId, branch: .military)
            let techEco = WorldDepth.techLevel(r, nation: nationId, branch: .economy)
            return techMil >= 5 && techEco >= 5 && ic(r, nationId: nationId) >= 150.0
        }
        if era == .antiquity || era == .medieval || era == .gunpowder || era == .ww1 { return false }
        if era == .modern { return true }
        let techMil = WorldDepth.techLevel(r, nation: nationId, branch: .military)
        let techEco = WorldDepth.techLevel(r, nation: nationId, branch: .economy)
        if era == .ww2 {
            return year >= 1943 && techMil >= 5 && techEco >= 5 && ic(r, nationId: nationId) >= 150.0
        }
        return techMil >= 6 && techEco >= 6 && ic(r, nationId: nationId) >= 160.0
    }

    /// 判断某国是否真正具备自主兴建核反应堆的超级大国门槛（防止中小农业国随意造核弹）。
    public static func isNuclearCapable(_ r: JS, nationId: String) -> Bool {
        guard isNuclearEra(r, nationId: nationId) else { return false }
        if reactors(r, nationId: nationId) > 0 || nukes(r, nationId: nationId) > 0 { return true }
        let techMil = WorldDepth.techLevel(r, nation: nationId, branch: .military)
        let techEco = WorldDepth.techLevel(r, nation: nationId, branch: .economy)
        return techMil >= 5 && techEco >= 5 && ic(r, nationId: nationId) >= 175.0
    }

    private static func computeBaseNationMetrics(_ r: JS, nationId nid: String, era: HistoricalEra) -> (ic: Double, ws: Double, air: Double, mob: String, reactors: Int, nukeProgress: Double, nukes: Int) {
        let hp = (!r.regimes.isNull && !r.regimes.historicalPower.isNull) ? r.regimes.historicalPower[nid] : .null
        let legacyHoi = (!r.regimes.isNull && !r.regimes.hoi4.isNull) ? r.regimes.hoi4[nid] : .null
        let techEco = WorldDepth.techLevel(r, nation: nid, branch: .economy)
        let techMil = WorldDepth.techLevel(r, nation: nid, branch: .military)
        let goldPerMonth = (!r.finance.isNull && !r.finance.nations[nid].isNull)
            ? max(0.0, r.finance.nations[nid].goldPerMonth.optionalNumber ?? 35.0)
            : 35.0
        let provCount = r.world.isNull ? 0 : r.world.provinces.asArray.reduce(0) { $0 + ($1.controller.optionalString == nid ? 1 : 0) }
        let effectiveProvs = provCount <= 16 ? Double(provCount) : 16.0 + Double(provCount - 16) * 0.35
        let indIdx = industryIndex(r, nationId: nid)
        let atWar = !r.world.isNull && !r.world.statecraft.isNull && !r.world.statecraft.relations.isNull
            && r.world.statecraft.relations.asArray.contains { ($0.a.optionalString == nid || $0.b.optionalString == nid) && $0.status.optionalString == "war" }

        let eraICMult: Double = {
            switch era {
            case .antiquity: return 0.65
            case .medieval:  return 0.78
            case .gunpowder: return 1.00
            case .ww1:       return 1.25
            case .ww2:       return 1.55
            case .modern:    return 1.75
            }
        }()

        let rawIC = hp.ic.optionalNumber
            ?? hp.industrialCapacity.optionalNumber
            ?? legacyHoi.industrialCapacity.optionalNumber
            ?? ((14.0 + goldPerMonth * 0.38 + Double(techEco) * 12.0 + effectiveProvs * 3.8) * indIdx * eraICMult)
        let ic = clamp(rawIC, 10.0, 500.0)

        let defaultWS: Double = atWar ? 64.0 : (era == .ww2 || era == .ww1 ? 52.0 : 44.0)
        let ws = clamp(hp.warSupport.optionalNumber ?? legacyHoi.warSupport.optionalNumber ?? defaultWS, 0.0, 100.0)

        let rawAir: Double = {
            if let explicit = hp.airPower.optionalNumber { return explicit }
            if era == .ww2 || era == .modern {
                // 二战/现代制空权由航空军备科技（techMil）与真实工业底盘（indIdx）主导，防止低工业农业大国仅靠面积顶满 100 抹平日本/德美苏空军代差
                return (Double(techMil) * 8.5 + min(300.0, ic) * 0.12) * pow(indIdx, 0.85)
            }
            if era == .ww1 {
                return (Double(techMil) * 2.5 + min(260.0, ic) * 0.06) * pow(indIdx, 0.70)
            }
            return 0.0
        }()
        let air = clamp(rawAir, 0.0, 100.0)

        let nuclearYearAllowed: Bool = {
            let isHistorical = !r.regimes.isNull && !r.regimes.historicalScenarioId.isNull
            if isHistorical { return HistoricalEra.displayYear(r) >= 1943 }
            return era == .modern || (era == .ww2 && HistoricalEra.displayYear(r) >= 1943)
        }()
        let rawReactors = hp.startingReactors.optionalNumber
            ?? hp.reactors.optionalNumber
            ?? hp.nuclearReactors.optionalNumber
            ?? legacyHoi.reactors.optionalNumber
            ?? 0.0
        let reactors = nuclearYearAllowed ? max(0, min(5, Int(rawReactors.rounded()))) : 0
        let rawProg = hp.nuclearProgress.optionalNumber
            ?? legacyHoi.nuclearProgress.optionalNumber
            ?? 0.0
        let nukeProg = nuclearYearAllowed ? clamp(rawProg, 0.0, 99.9) : 0.0
        let rawNukes = hp.startingNukes.optionalNumber
            ?? hp.nukes.optionalNumber
            ?? legacyHoi.nukes.optionalNumber
            ?? 0.0
        let nukes = nuclearYearAllowed ? max(0, min(99, Int(rawNukes.rounded()))) : 0
        let mobRaw = hp.mobilization.optionalString ?? (atWar ? "war_economy" : "early")
        let mob = MobilizationLaw(rawValue: mobRaw)?.rawValue ?? "early"

        return (ic, ws, air, mob, reactors, nukeProg, nukes)
    }

    @discardableResult
    private static func ensureNation(_ r: JS, nationId nid: String) -> JS {
        if r.regimes.isNull { Regimes.enable(r) }
        if r.regimes.hoi4.isNull { ensureInitialized(r) }
        if r.regimes.hoi4.nations.isNull { r.regimes.hoi4.nations = JS.object() }
        let existing = r.regimes.hoi4.nations[nid]
        if !existing.isNull { return existing }

        let era = HistoricalEra.current(r)
        let m = computeBaseNationMetrics(r, nationId: nid, era: era)
        let row = JS.object()
        row.ic = JS((m.ic * 10).rounded() / 10)
        row.warSupport = JS((m.ws * 10).rounded() / 10)
        row.airPower = JS((m.air * 10).rounded() / 10)
        row.mobilization = JS(m.mob)
        row.reactors = JS(m.reactors)
        row.nukeProgress = JS((m.nukeProgress * 10).rounded() / 10)
        row.nukes = JS(m.nukes)
        row.nukesDropped = JS(0)
        row.nukesHit = JS(0)
        row.eventICBonus = JS(0)
        r.regimes.hoi4.nations[nid] = row
        return row
    }

    /// v14.0.0：永久增加/削减历史事件带来的工业产能修正（纳入月度 targetIC 基线，绝不再被 18%/月平滑抹除！）。
    public static func addEventIC(_ r: JS, nationId nid: String, delta: Double) {
        guard delta != 0 else { return }
        ensureInitialized(r)
        let row = ensureNation(r, nationId: nid)
        let prevBonus = row.eventICBonus.optionalNumber ?? 0.0
        row.eventICBonus = JS(clamp(prevBonus + delta, -120.0, 220.0))
        let cur = row.ic.optionalNumber ?? 50.0
        row.ic = JS((clamp(cur + delta, 10.0, 500.0) * 10).rounded() / 10)
    }

    /// v14.0.0：直接调节某国战争支持度（用于历史事件宣战振奋、战败受挫或战时演说）。
    public static func adjustWarSupport(_ r: JS, nationId nid: String, delta: Double) {
        guard delta != 0 else { return }
        ensureInitialized(r)
        let row = ensureNation(r, nationId: nid)
        let cur = row.warSupport.optionalNumber ?? 50.0
        row.warSupport = JS((clamp(cur + delta, 0.0, 100.0) * 10).rounded() / 10)
    }

    /// v14.0.0：事件 enact `law:`（`econ_civilian`/`econ_partial`/`econ_war`/`econ_total` 及 HOI4 别名）时同步切换真实动员法案，消除两套系统脱节！
    public static func syncMobilizationFromReform(_ r: JS, nationId nid: String, reformId: String) {
        let mapped: MobilizationLaw?
        switch reformId {
        case "econ_civilian", "civilian_economy", "civilian": mapped = .civilian
        case "econ_partial", "partial_mobilization", "early": mapped = .early
        case "econ_war", "war_economy": mapped = .warEconomy
        case "econ_total", "total_mobilization", "total": mapped = .total
        default: mapped = nil
        }
        guard let law = mapped else { return }
        ensureInitialized(r)
        let row = ensureNation(r, nationId: nid)
        row.mobilization = JS(law.rawValue)
    }

    /// 初始化 `r.regimes.hoi4` 账本及全部国家的工业产能、战争支持度、制空权、反应堆与核武初值。
    /// 优先从历史剧本 `r.regimes.historicalPower[nid]` 播种，普通世界则依据经济与科技自动核算。
    public static func ensureInitialized(_ r: JS) {
        guard !r.regimes.isNull else { return }
        let era = HistoricalEra.current(r)
        if r.regimes.hoi4.isNull {
            r.regimes.hoi4 = JS.object()
        }
        let h = r.regimes.hoi4
        if h.worldTension.isNull {
            let activeWars: Int = {
                guard !r.world.isNull, !r.world.statecraft.isNull, !r.world.statecraft.relations.isNull else { return 0 }
                return r.world.statecraft.relations.asArray.reduce(0) { $0 + ($1.status.optionalString == "war" ? 1 : 0) }
            }()
            let baseTension: Double = {
                switch era {
                case .ww2:    return 35.0
                case .modern: return 40.0
                case .ww1:    return 25.0
                default:      return 5.0
                }
            }()
            h.worldTension = JS(clamp(baseTension + Double(activeWars) * 8.0, 0.0, 100.0))
        }
        if h.lastNukeProvince.isNull { h.lastNukeProvince = JS(-1) }
        if h.lastNukeDay.isNull { h.lastNukeDay = JS(0) }
        if h.fallout.isNull { h.fallout = JS.object() }
        if h.nations.isNull { h.nations = JS.object() }
        guard !r.world.isNull, !r.world.nations.isNull else { return }
        for n in r.world.nations.asArray {
            let nid = n.id.asString
            if h.nations[nid].isNull {
                _ = ensureNation(r, nationId: nid)
            }
        }
    }

    public static func worldTension(_ r: JS) -> Double {
        guard !r.regimes.isNull, !r.regimes.hoi4.isNull else { return 0 }
        return clamp(r.regimes.hoi4.worldTension.optionalNumber ?? 0, 0, 100)
    }

    public static func ic(_ r: JS, nationId: String) -> Double {
        guard !r.regimes.isNull, !r.regimes.hoi4.isNull, !r.regimes.hoi4.nations[nationId].isNull else {
            return computeBaseNationMetrics(r, nationId: nationId, era: HistoricalEra.current(r)).ic
        }
        return clamp(r.regimes.hoi4.nations[nationId].ic.optionalNumber ?? 30, 10, 500)
    }

    public static func warSupport(_ r: JS, nationId: String) -> Double {
        guard !r.regimes.isNull, !r.regimes.hoi4.isNull, !r.regimes.hoi4.nations[nationId].isNull else {
            return 50.0
        }
        return clamp(r.regimes.hoi4.nations[nationId].warSupport.optionalNumber ?? 50, 0, 100)
    }

    public static func airPower(_ r: JS, nationId: String) -> Double {
        guard !r.regimes.isNull, !r.regimes.hoi4.isNull, !r.regimes.hoi4.nations[nationId].isNull else {
            return computeBaseNationMetrics(r, nationId: nationId, era: HistoricalEra.current(r)).air
        }
        return clamp(r.regimes.hoi4.nations[nationId].airPower.optionalNumber ?? 0, 0, 100)
    }

    public static func mobilization(_ r: JS, nationId: String) -> MobilizationLaw {
        guard !r.regimes.isNull, !r.regimes.hoi4.isNull, !r.regimes.hoi4.nations[nationId].isNull,
              let raw = r.regimes.hoi4.nations[nationId].mobilization.optionalString,
              let law = MobilizationLaw(rawValue: raw) else {
            return .early
        }
        return law
    }

    public static func nukes(_ r: JS, nationId: String) -> Int {
        guard !r.regimes.isNull, !r.regimes.hoi4.isNull, !r.regimes.hoi4.nations[nationId].isNull else { return 0 }
        return max(0, r.regimes.hoi4.nations[nationId].nukes.asInt)
    }

    public static func reactors(_ r: JS, nationId: String) -> Int {
        guard !r.regimes.isNull, !r.regimes.hoi4.isNull, !r.regimes.hoi4.nations[nationId].isNull else { return 0 }
        return max(0, min(5, r.regimes.hoi4.nations[nationId].reactors.asInt))
    }

    public static func falloutMonths(_ r: JS, provinceId: String) -> Int {
        guard !r.regimes.isNull, !r.regimes.hoi4.isNull, !r.regimes.hoi4.fallout.isNull else { return 0 }
        return max(0, r.regimes.hoi4.fallout[provinceId].asInt)
    }

    /// 制空权战场倍率（v7.0 真实二战/现代制空权压制：开阔地绝对制空最高 +42% 密接支援、失制空 −22%，山地/密林地形按史实折减 50%/28%）。
    public static func airSuperiorityBonus(_ r: JS, attacker: String, victim: String, terrain: String? = nil) -> Double {
        let era = HistoricalEra.current(r)
        guard era.isModernAirEra else { return 1.0 }
        let airA = airPower(r, nationId: attacker)
        let airB = airPower(r, nationId: victim)
        let diff = airA - airB
        let terrainFactor: Double = {
            switch terrain {
            case "mountain": return 0.50
            case "forest":   return 0.72
            default:         return 1.00
            }
        }()
        if diff > 4.0 {
            return 1.0 + min(0.42, (diff / 100.0) * 0.52) * terrainFactor
        } else if diff < -4.0 {
            return max(0.78, 1.0 + (diff / 100.0) * 0.28 * terrainFactor)
        }
        return 1.0
    }

    /// 工业与装备质量对抗倍率（v7.0 真实近现代降维打击：一战/二战/现代重炮机械化火力代差高达 0.55…1.92 倍，古代保持温和 0.82…1.25）。
    public static func industrialCombatRatio(_ r: JS, attacker: String, victim: String) -> Double {
        let icA = ic(r, nationId: attacker)
        let icB = ic(r, nationId: victim)
        let idxA = industryIndex(r, nationId: attacker)
        let idxB = industryIndex(r, nationId: victim)
        let era = HistoricalEra.current(r)
        if era == .ww1 || era == .ww2 || era == .modern {
            let effA = icA * (0.40 + 0.60 * idxA)
            let effB = icB * (0.40 + 0.60 * idxB)
            let ratio = (effA + 18.0) / max(10.0, effB + 18.0)
            return clamp(pow(ratio, 0.46), 0.55, 1.92)
        }
        let effA = icA * (0.65 + 0.35 * idxA)
        let effB = icB * (0.65 + 0.35 * idxB)
        let ratio = (effA + 25.0) / max(15.0, effB + 25.0)
        return clamp(pow(ratio, 0.24), 0.82, 1.25)
    }

    // MARK: - 3. 月度演进

    /// 每月由 `Regimes.day` 驱动：更新全球紧张度、核反应堆装填进度、核辐射衰减、战争支持度、制空权与工业产能。
    public static func month(_ r: JS, key: Int) {
        guard UnitKinds.enabled, !r.regimes.isNull, r.regimes.enabled.isTruthy else { return }
        ensureInitialized(r)
        let h = r.regimes.hoi4
        let era = HistoricalEra.current(r)

        // 1. 全球紧张度演进
        var activeWars = 0
        var warringNations = Set<String>()
        if !r.world.statecraft.isNull && !r.world.statecraft.relations.isNull {
            for rel in r.world.statecraft.relations.asArray where rel.status.optionalString == "war" {
                activeWars += 1
                if let a = rel.a.optionalString { warringNations.insert(a) }
                if let b = rel.b.optionalString { warringNations.insert(b) }
            }
        }
        let siegeCount = (!r.occupation.isNull && !r.occupation.sieges.isNull) ? r.occupation.sieges.length : 0
        var tension = h.worldTension.optionalNumber ?? 0.0
        if activeWars > 0 {
            let rise = min(4.5, Double(activeWars) * 0.65 + Double(min(8, siegeCount)) * 0.22)
            tension = clamp(tension + rise, 0.0, 100.0)
        } else {
            let floor: Double = (era == .modern) ? 18.0 : (era == .ww2 ? 12.0 : 0.0)
            tension = max(floor, tension - 1.2)
        }
        h.worldTension = JS((tension * 10).rounded() / 10)

        // 2. 核辐射月度衰减与受污染州郡供给压制
        if !h.fallout.isNull {
            var provById = [String: JS]()
            for p in r.world.provinces.asArray { provById[p.id.asString] = p }
            for (pid, remJS) in h.fallout.objectEntries {
                let next = remJS.asInt - 1
                if next <= 0 {
                    h.fallout.delete(pid)
                } else {
                    h.fallout[pid] = JS(next)
                    if let p = provById[pid] {
                        let curSup = p.supply.optionalNumber ?? 20.0
                        p.supply = JS(max(5.0, curSup - 4.0))
                    }
                }
            }
        }

        // 3. 逐国更新 IC、战争支持度、制空权、动员税负与核反应堆进度
        for n in r.world.nations.asArray {
            let nid = n.id.asString
            guard Vassals.alive(r, nid), !Regimes.isBlank(r, nid) else { continue }
            let row = ensureNation(r, nationId: nid)
            let techEco = WorldDepth.techLevel(r, nation: nid, branch: .economy)
            let techMil = WorldDepth.techLevel(r, nation: nid, branch: .military)
            let law = mobilization(r, nationId: nid)
            let atWar = warringNations.contains(nid)
            let fin = r.finance.nations[nid]
            let goldPerMonth = fin.isNull ? 30.0 : max(0.0, fin.goldPerMonth.optionalNumber ?? 30.0)

            // 3a. 动员法案税收与安定实效
            if !fin.isNull && law.taxBonus != 0 && goldPerMonth > 0 {
                let curGold = fin.gold.optionalNumber ?? 0.0
                fin.gold = JS(max(0.0, curGold + goldPerMonth * law.taxBonus))
            }
            if law == .total, !r.destiny.isNull, !r.destiny.nations[nid].isNull {
                let drag = atWar ? 0.12 : 0.35
                let curD = r.destiny.nations[nid].destiny.optionalNumber ?? 50.0
                r.destiny.nations[nid].destiny = JS(max(0.0, curD - drag))
            }

            // 3b. 工业产能 IC 平滑演进（v14.0.0：永久累加历史事件带来的 eventICBonus，彻底修复事件 +IC 被月度平滑以 18%/月侵蚀回原值的缺陷！）
            let baseMetrics = computeBaseNationMetrics(r, nationId: nid, era: era)
            let acadPts = Double(WorldDepth.nationAcademyPoints(r, nation: nid))
            let eventBonus = row.eventICBonus.optionalNumber ?? 0.0
            let targetIC = clamp((baseMetrics.ic + acadPts * 0.45 + eventBonus) * law.icFactor, 10.0, 500.0)
            let curIC = row.ic.optionalNumber ?? baseMetrics.ic
            let nextIC = clamp(curIC + (targetIC - curIC) * 0.18, 10.0, 500.0)
            row.ic = JS((nextIC * 10).rounded() / 10)

            // 3c. 战争支持度演进
            let destinyVal = (!r.destiny.isNull && !r.destiny.nations[nid].isNull)
                ? (r.destiny.nations[nid].destiny.optionalNumber ?? 50.0) : 50.0
            let hits = row.nukesHit.asInt
            let lawWSBonus: Double = (law == .total) ? 8.0 : (law == .warEconomy ? 4.0 : (law == .civilian ? -6.0 : 0.0))
            let targetWS = clamp(
                (atWar ? 56.0 : 38.0) + tension * 0.24 + (destinyVal - 50.0) * 0.22 + lawWSBonus - Double(hits) * 16.0,
                5.0, 100.0
            )
            let curWS = row.warSupport.optionalNumber ?? 50.0
            let wsDelta = max(-3.0, min(3.0, (targetWS - curWS) * 0.20))
            row.warSupport = JS((clamp(curWS + wsDelta, 0.0, 100.0) * 10).rounded() / 10)

            // 3d. 制空权演进（与初始化公式一致，受航空军备科技与真实工业底盘 indIdx 制约）
            let indIdx = industryIndex(r, nationId: nid)
            let targetAir: Double = {
                if era == .ww2 || era == .modern {
                    return clamp((Double(techMil) * 8.5 + min(300.0, nextIC) * 0.12) * pow(indIdx, 0.85) * law.milProdMult, 4.0, 100.0)
                }
                if era == .ww1 {
                    return clamp((Double(techMil) * 2.5 + min(260.0, nextIC) * 0.06) * pow(indIdx, 0.70) * law.milProdMult, 0.0, 45.0)
                }
                return 0.0
            }()
            let curAir = row.airPower.optionalNumber ?? targetAir
            let airDelta = max(-4.0, min(4.0, (targetAir - curAir) * 0.22))
            row.airPower = JS((clamp(curAir + airDelta, 0.0, 100.0) * 10).rounded() / 10)

            // 3e. 核反应堆推进战略核武器装填（史实节律：单座反应堆约 18-24 月完成一枚核弹头装填）
            let rCount = max(0, min(5, row.reactors.asInt))
            if rCount > 0 && isNuclearEra(r, nationId: nid) {
                var prog = (row.nukeProgress.optionalNumber ?? 0.0) + Double(rCount) * (2.6 + Double(techEco) * 0.45)
                var minted = 0
                while prog >= 100.0 {
                    prog -= 100.0
                    minted += 1
                }
                if minted > 0 {
                    let nextNukes = row.nukes.asInt + minted
                    row.nukes = JS(nextNukes)
                    let name = n.name.asString
                    _ = People.announce(
                        r, kind: "event",
                        text: "【核威慑】\(name)完成一枚战略核武器装填",
                        reason: "\(name)依托 \(rCount) 座核反应堆完成战略核弹头装配（现保有核弹 \(nextNukes) 枚）。",
                        nations: [nid],
                        province: Rebellion.capitalProvince(r, nid)
                    )
                }
                row.nukeProgress = JS((prog * 10).rounded() / 10)
            }
        }
        _ = key
    }

    // MARK: - 4. 核心玩家与 AI 战略操作 API

    /// 建造核反应堆：要求已解锁核时代、反应堆 < 5 座且国库足够（`800 + reactors * 450` 金）。
    public static func buildReactor(_ r: JS, nationId: String) -> (ok: Bool, text: String) {
        Regimes.enable(r)
        ensureInitialized(r)
        guard let nation = r.world.nations.asArray.first(where: { $0.id.asString == nationId }),
              Vassals.alive(r, nationId) else {
            return (false, "目标国家不存在或已灭亡。")
        }
        guard isNuclearCapable(r, nationId: nationId) else {
            return (false, "尚未满足核工程建造条件（历史剧本须至 1943 年后，且具备 5 阶以上军备/农商科技与超级大国级工业产能 IC ≥ 175）。")
        }
        let row = ensureNation(r, nationId: nationId)
        let cur = max(0, row.reactors.asInt)
        guard cur < 5 else {
            return (false, "核反应堆已达上限（5 座），无需继续扩建。")
        }
        let cost = reactorCost(currentReactors: cur)
        let fin = r.finance.nations[nationId]
        let gold = fin.isNull ? 0.0 : (fin.gold.optionalNumber ?? 0.0)
        guard gold >= cost else {
            return (false, "国库不足（建造第 \(cur + 1) 座核反应堆需 \(Int(cost)) 金，当前国库 \(Int(gold)) 金）。")
        }
        if !fin.isNull { fin.gold = JS(max(0.0, gold - cost)) }
        let next = cur + 1
        row.reactors = JS(next)

        let h = r.regimes.hoi4
        h.worldTension = JS(clamp((h.worldTension.optionalNumber ?? 0.0) + 4.0, 0.0, 100.0))

        let name = nation.name.asString
        _ = People.announce(
            r, kind: "event",
            text: "【核工程】\(name)建成第 \(next) 座核反应堆",
            reason: "斥资 \(Int(cost)) 金扩建战略核设施，核弹头月度装填进度大幅提速。",
            nations: [nationId],
            province: Rebellion.capitalProvince(r, nationId)
        )
        return (true, "\(name)建成第 \(next) 座核反应堆（耗资 \(Int(cost)) 金）。")
    }

    /// 实施战略核打击：消耗 1 枚核武器，摧毁目标州 72% 敌军、城防归零、补给降至 5、人口 −28%、辐射 12 月，
    /// 削减目标国战争支持度 −28、国运 −14、推高全球紧张度 +25，并在连续遭核击时引发全军士气崩塌与核威慑投降意愿。
    public static func nuclearStrike(_ r: JS, attackerId: String, provinceIndex: Int) -> (ok: Bool, text: String) {
        Regimes.enable(r)
        ensureInitialized(r)
        let provinces = r.world.provinces.asArray
        guard provinces.indices.contains(provinceIndex) else {
            return (false, "目标州郡不存在。")
        }
        guard let attacker = r.world.nations.asArray.first(where: { $0.id.asString == attackerId }),
              Vassals.alive(r, attackerId) else {
            return (false, "发起国不存在或已灭亡。")
        }
        let p = provinces[provinceIndex]
        let pid = p.id.asString
        let defId = p.controller.optionalString ?? ""
        guard defId != attackerId else {
            return (false, "不能向本国实控州郡投放核武器。")
        }
        let atkRow = ensureNation(r, nationId: attackerId)
        let curNukes = atkRow.nukes.asInt
        guard curNukes >= 1 else {
            return (false, "核武库暂无可用战略核武器，请先建造核反应堆完成装填。")
        }

        // 1. 消耗核弹并更新全局核战状态
        atkRow.nukes = JS(curNukes - 1)
        atkRow.nukesDropped = JS(atkRow.nukesDropped.asInt + 1)
        let h = r.regimes.hoi4
        h.lastNukeProvince = JS(provinceIndex)
        h.lastNukeDay = JS(r.world.day.asInt)
        if h.fallout.isNull { h.fallout = JS.object() }
        h.fallout[pid] = JS(12)
        h.worldTension = JS(clamp((h.worldTension.optionalNumber ?? 0.0) + 25.0, 0.0, 100.0))

        // 2. 摧毁目标州内 72% 敌军驻军（兼容已挂载与未挂载 ForceBridge 的测试场景）
        var locatedArmies = [JS]()
        var seenArmyIds = Set<String>()
        if Armies.bridge != nil {
            for v in Armies.space(r) where v.province?.id.asString == pid {
                let aid = v.army.id.asString
                if seenArmyIds.insert(aid).inserted { locatedArmies.append(v.army) }
            }
        }
        for a in r.world.armies.asArray where a.provinceId.optionalString == pid && a.troops.asNumber > 0 && a.status.asString != "destroyed" {
            let aid = a.id.asString
            if seenArmyIds.insert(aid).inserted { locatedArmies.append(a) }
        }
        var totalKilled = 0
        for a in locatedArmies where a.nationId.optionalString != attackerId {
            let before = a.troops.asNumber
            guard before > 0 else { continue }
            let killed = Int((before * 0.72).rounded(.up))
            let left = max(0, Int(before) - killed)
            totalKilled += killed
            a.troops = JS(left)
            a.morale = JS(max(0.0, (a.morale.optionalNumber ?? 50.0) - 45.0))
            if let victimNation = a.nationId.optionalString, !victimNation.isEmpty {
                Wars.recordLoss(r, victimNation, "combat", killed)
            }
            if left <= 0 {
                a.status = JS("destroyed")
                a.morale = JS(0)
                a.route = .array()
                a.progress = JS(0)
                let aid = a.id.asString
                if !r.armyPositions.isNull && !r.armyPositions.records[aid].isNull {
                    let t = r.armyPositions.records[aid].clone()
                    t.status = JS("halted")
                    r.armyPositions.records[aid] = t
                }
                if !r.battles.isNull && !r.battles.plans.isNull { r.battles.plans.delete(aid) }
            }
        }

        // 3. 城市工事与要塞归零、供给跌至 5、人口 −28%
        if !r.upperCombat.isNull && !r.upperCombat.provinces[pid].isNull {
            r.upperCombat.provinces[pid].storedDefense = JS(0)
            r.upperCombat.provinces[pid].manualFortress = JS(false)
        }
        if !r.regimes.infra.isNull && !r.regimes.infra[pid].isNull {
            r.regimes.infra[pid].fortress = JS(0)
        }
        if !r.occupation.isNull && !r.occupation.sieges.isNull {
            for s in r.occupation.sieges.asArray where s.provinceId.optionalString == pid {
                s.resistance = JS(0)
            }
        }
        p.supply = JS(5)
        if !r.world.statecraft.isNull && !r.world.statecraft.provinces.isNull,
           let stock = r.world.statecraft.provinces.asArray.first(where: { $0.provinceId.optionalString == pid }) {
            let pop = stock.population.optionalNumber ?? 0
            stock.population = JS(max(100.0, (pop * 0.72).rounded()))
            let grain = stock.grain.optionalNumber ?? 0
            stock.grain = JS((grain * 0.40).rounded())
        }

        // 4. 目标国战争支持度、国运与核威慑崩盘检查
        let atkName = attacker.name.asString
        let provName = p.name.asString
        var defName = "无主之地"
        var capitulated = false

        if !defId.isEmpty && !Regimes.isBlank(r, defId) {
            defName = Vassals.name(r, defId)
            let defRow = ensureNation(r, nationId: defId)
            let nextWS = clamp((defRow.warSupport.optionalNumber ?? 50.0) - 28.0, 0.0, 100.0)
            defRow.warSupport = JS((nextWS * 10).rounded() / 10)
            let nextHits = defRow.nukesHit.asInt + 1
            defRow.nukesHit = JS(nextHits)

            if !r.destiny.isNull && !r.destiny.nations[defId].isNull {
                let curD = r.destiny.nations[defId].destiny.optionalNumber ?? 50.0
                r.destiny.nations[defId].destiny = JS(max(0.0, curD - 14.0))
            }

            _ = People.announce(
                r, kind: "war",
                text: "【核打击】\(atkName)向\(defName)\(provName)投下战略核武器",
                reason: "核爆重创\(provName)守军（损兵 \(totalKilled) 人）、城防尽毁、补给跌至 5、人口锐减 28% 并遗留 12 月核辐射；\(defName)战争支持度 −28、国运 −14，全球紧张度 +25。",
                nations: [attackerId, defId],
                province: pid
            )

            // 连续核打击引发核威慑投降 / 全军士气彻底崩塌
            if nextHits >= 2 && nextWS <= 20.0 {
                capitulated = true
                defRow.peaceWilling = JS(true)
                defRow.nuclearCapitulated = JS(true)
                for a in r.world.armies.asArray where a.nationId.optionalString == defId && a.troops.asNumber > 0 && a.status.asString != "destroyed" {
                    a.morale = JS(10)
                }
                if !r.destiny.isNull && !r.destiny.nations[defId].isNull {
                    let curD = r.destiny.nations[defId].destiny.optionalNumber ?? 10.0
                    r.destiny.nations[defId].destiny = JS(min(curD, 6.0))
                }
                let defBook = Regimes.book(r, defId)
                defBook.defeatShock = JS(0.85)
                defBook.defeatTick = r.clock.tick.clone()

                _ = People.announce(
                    r, kind: "war",
                    text: "【核威慑溃败】\(defName)遭连续核打击，全军士气崩溃愿即刻议和",
                    reason: "\(defName)累计承受 \(nextHits) 次战略核打击、战争支持度跌至 \(Int(nextWS))%，全军士气跌至 10 点并丧失继续作战意志。",
                    nations: [attackerId, defId],
                    province: pid
                )
            }
        } else {
            _ = People.announce(
                r, kind: "war",
                text: "【核打击】\(atkName)向\(provName)投下战略核武器",
                reason: "核爆夷平\(provName)工事并遗留 12 个月核辐射，全球紧张度 +25。",
                nations: [attackerId],
                province: pid
            )
        }

        if capitulated {
            return (true, "【核打击】已对\(defName)\(provName)实施战略核打击！\(defName)连遭核爆，全军士气崩溃并愿即刻议和。")
        }
        return (true, "【核打击】已向\(defName)\(provName)投下战略核武器（毁伤敌军 \(totalKilled) 人，工事归零，辐射持续 12 月）。")
    }

    /// 切换国家工业动员体制：`civilian` / `early` / `war_economy` / `total`。
    public static func setMobilization(_ r: JS, nationId: String, level: String) -> (ok: Bool, text: String) {
        Regimes.enable(r)
        ensureInitialized(r)
        guard let law = MobilizationLaw(rawValue: level) else {
            return (false, "未知动员法案（可选：civilian / early / war_economy / total）。")
        }
        guard let nation = r.world.nations.asArray.first(where: { $0.id.asString == nationId }),
              Vassals.alive(r, nationId) else {
            return (false, "目标国家不存在或已灭亡。")
        }
        let row = ensureNation(r, nationId: nationId)
        row.mobilization = JS(law.rawValue)
        return (true, "\(nation.name.asString)已切换为「\(law.label)」（\(law.note)）。")
    }

    /// 导出国家 HOI4 战略与核武态势 JSON（供 `NationSheet`、`MilitaryOverview`、`ProvinceSheet` 展示）。
    public static func statusJS(_ r: JS, nationId: String) -> JS {
        let era = HistoricalEra.current(r)
        let o = JS.object()
        o.eraId = JS(era.rawValue)
        o.eraTitle = JS(era.title)
        o.eraShortTitle = JS(era.shortTitle)
        o.eraWeapons = JS(era.weapons)

        let tension: Double
        let icVal: Double
        let wsVal: Double
        let airVal: Double
        let mobStr: String
        let rCount: Int
        let progVal: Double
        let nukeCount: Int
        let nukesHitCount: Int
        let nukesDroppedCount: Int
        let lastNukeProv: Int
        let lastNukeDay: Int

        if !r.regimes.isNull && !r.regimes.hoi4.isNull && !r.regimes.hoi4.nations[nationId].isNull {
            let h = r.regimes.hoi4
            let row = h.nations[nationId]
            tension = clamp(h.worldTension.optionalNumber ?? 0, 0, 100)
            icVal = clamp(row.ic.optionalNumber ?? 30, 10, 500)
            wsVal = clamp(row.warSupport.optionalNumber ?? 50, 0, 100)
            airVal = clamp(row.airPower.optionalNumber ?? 0, 0, 100)
            mobStr = row.mobilization.optionalString ?? "early"
            rCount = max(0, min(5, row.reactors.asInt))
            progVal = clamp(row.nukeProgress.optionalNumber ?? 0, 0, 100)
            nukeCount = max(0, row.nukes.asInt)
            nukesHitCount = max(0, row.nukesHit.asInt)
            nukesDroppedCount = max(0, row.nukesDropped.asInt)
            lastNukeProv = h.lastNukeProvince.optionalNumber.map(Int.init) ?? -1
            lastNukeDay = h.lastNukeDay.optionalNumber.map(Int.init) ?? 0
        } else {
            let m = computeBaseNationMetrics(r, nationId: nationId, era: era)
            tension = (!r.regimes.isNull && !r.regimes.hoi4.isNull) ? clamp(r.regimes.hoi4.worldTension.optionalNumber ?? 0, 0, 100) : 0.0
            icVal = m.ic
            wsVal = m.ws
            airVal = m.air
            mobStr = m.mob
            rCount = m.reactors
            progVal = m.nukeProgress
            nukeCount = m.nukes
            nukesHitCount = 0
            nukesDroppedCount = 0
            lastNukeProv = -1
            lastNukeDay = 0
        }

        let law = MobilizationLaw(rawValue: mobStr) ?? .early
        o.worldTension = JS((tension * 10).rounded() / 10)
        o.ic = JS((icVal * 10).rounded() / 10)
        o.warSupport = JS((wsVal * 10).rounded() / 10)
        o.airPower = JS((airVal * 10).rounded() / 10)
        o.mobilization = JS(law.rawValue)
        o.mobilizationLabel = JS(law.label)
        o.nuclearUnlocked = JS(isNuclearEra(r, nationId: nationId))
        o.reactors = JS(rCount)
        o.nukeProgress = JS((progVal * 10).rounded() / 10)
        o.nukes = JS(nukeCount)
        o.nukesHit = JS(nukesHitCount)
        o.nukesDropped = JS(nukesDroppedCount)
        o.reactorCost = JS(Int(reactorCost(currentReactors: rCount)))
        o.lastNukeProvince = JS(lastNukeProv)
        o.lastNukeDay = JS(lastNukeDay)
        return o
    }
}
