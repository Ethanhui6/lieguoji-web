import Foundation

/// 历史时代分级（v6.0.0 严格时代锁兵种与装备体系，Linux + iOS 通用，纯 Foundation）：
/// 按年份（或剧本显式指定的 `r.regimes.historicalEra`）锁定列国军队编制、兵种与武器制式，
/// 彻底避免先秦/中古出现坦克火炮，或二战/现代出现弓箭战车的穿越错乱。
public enum HistoricalEra: String, Codable, CaseIterable, Sendable {
    case antiquity = "antiquity"
    case medieval  = "medieval"
    case gunpowder = "gunpowder"
    case ww1       = "ww1"
    case ww2       = "ww2"
    case modern    = "modern"

    /// 完整时代中文标题
    public var title: String {
        switch self {
        case .antiquity: return "先秦青铜时代"
        case .medieval:  return "中古冷兵器时代"
        case .gunpowder: return "火器大航海时代"
        case .ww1:       return "工业堑壕时代"
        case .ww2:       return "二战机械化时代"
        case .modern:    return "冷战与现代时代"
        }
    }

    /// 简短徽章标题
    public var shortTitle: String {
        switch self {
        case .antiquity: return "先秦冷兵器"
        case .medieval:  return "中古冷兵器"
        case .gunpowder: return "线列火炮"
        case .ww1:       return "一战工业军"
        case .ww2:       return "二战装甲航空"
        case .modern:    return "现代合成核武"
        }
    }

    /// 时代代表性主力武器装备
    public var weapons: String {
        switch self {
        case .antiquity: return "青铜戈戟 · 强弩 · 战车 · 楼船"
        case .medieval:  return "陌刀横刀 · 具装铁骑 · 抛石机 · 车船"
        case .gunpowder: return "燧发线列步枪 · 拿破仑野战炮 · 风帆战列舰"
        case .ww1:       return "栓动步枪 · 马克沁重机枪 · 榴弹重炮 · 无畏舰"
        case .ww2:       return "中型/重型坦克 · 机械化步兵 · 航母舰队 · 原子弹"
        case .modern:    return "主战坦克 · 战略导弹 · 核动力航母 · 氢弹威慑"
        }
    }

    /// 是否为冷兵器时代（先秦 / 中古）
    public var isColdWeaponEra: Bool {
        self == .antiquity || self == .medieval
    }

    /// 是否具备现代制空权作战加成
    public var isModernAirEra: Bool {
        self == .ww2 || self == .modern
    }

    /// 是否天然解锁核工程与战略核威慑
    public var isNuclearCapableEra: Bool {
        self == .ww2 || self == .modern
    }

    /// 根据公元年份映射历史时代（`< 0` 为先秦，`0..<1450` 中古，`1450..<1860` 火器，
    /// `1860..<1930` 一战，`1930..<1955` 二战，`>= 1955` 冷战与现代）。
    public static func from(year: Int) -> HistoricalEra {
        if year < 0 { return .antiquity }
        if year < 1450 { return .medieval }
        if year < 1860 { return .gunpowder }
        if year < 1930 { return .ww1 }
        if year < 1955 { return .ww2 }
        return .modern
    }

    /// 读取当前世界的真实显示年份（`year + yearOffset`）。
    public static func displayYear(_ r: JS) -> Int {
        let rawYear: Int = {
            if !r.life.isNull && !r.life.currentDate.isNull, let y = r.life.currentDate.year.optionalNumber, y.isFinite {
                return Int(y)
            }
            if !r.world.isNull, let day = r.world.day.optionalNumber, day.isFinite {
                return Int(day) / 365 + 1
            }
            return 1
        }()
        let offset: Int = {
            guard !r.regimes.isNull else { return 0 }
            if !r.regimes.calendar.isNull, let off = r.regimes.calendar.offset.optionalNumber, off.isFinite {
                return Int(off)
            }
            if let off = r.regimes.yearOffset.optionalNumber, off.isFinite {
                return Int(off)
            }
            return 0
        }()
        return rawYear + offset
    }

    /// 当前世界所处的历史时代：优先读取 `r.regimes.historicalEra`，否则由 `displayYear = year + yearOffset` 计算。
    public static func current(_ r: JS) -> HistoricalEra {
        if !r.regimes.isNull,
           let raw = r.regimes.historicalEra.optionalString,
           let explicit = HistoricalEra(rawValue: raw) {
            return explicit
        }
        return from(year: displayYear(r))
    }
}

/// 时代锁军制管理器：确保开局及读档后全部军团立刻换装符合当前历史时代的真实兵种与军号。
public enum EraMilitarySystem {
    /// 获取当前世界的历史时代。
    public static func currentEra(_ r: JS) -> HistoricalEra {
        HistoricalEra.current(r)
    }

    /// 检查某兵种 key 在目标时代是否合法。
    public static func isUnitAllowed(_ key: String, in era: HistoricalEra) -> Bool {
        UnitKinds.isAllowed(key, in: era)
    }

    /// 返回目标时代允许的全部兵种列表（按 `UnitKinds.kinds` 顺序）。
    public static func eraUnits(for era: HistoricalEra) -> [UnitKinds.Kind] {
        let allowed = UnitKinds.allowedKeys(for: era)
        return UnitKinds.kinds.filter { allowed.contains($0.key) }
    }

    /// 强制将世界内所有不符当前时代编制的军团替换为对应时代的真实兵种，并同步修正军号后缀。
    /// 仅在 App 规则开启（`UnitKinds.enabled`）且存在军团账本时生效，绝不影响网页黄金逐字节重放。
    public static func enforceEraUnits(_ r: JS) {
        guard UnitKinds.enabled, !r.world.isNull, !r.world.armies.isNull, !r.units.isNull else { return }
        let era = HistoricalEra.current(r)
        let knownNames = UnitKinds.kinds.map(\.name).sorted { $0.count > $1.count }

        for a in r.world.armies.asArray {
            let id = a.id.asString
            guard !id.isEmpty else { continue }
            let curKey = r.units[id].optionalString ?? "Infantry"
            if UnitKinds.isAllowed(curKey, in: era) { continue }

            let nid = a.nationId.optionalString ?? ""
            let culture = (!r.civilization.isNull && !nid.isEmpty)
                ? (r.civilization.nations[nid].cultureId.optionalString ?? "")
                : ""
            let milLvl = nid.isEmpty ? 3 : WorldDepth.techLevel(r, nation: nid, branch: .military)
            let indIdx = nid.isEmpty ? 1.0 : NuclearWarfare.industryIndex(r, nationId: nid)
            let picked = UnitKinds.pickForEra(era, culture: culture, id: id, techMil: milLvl, industryIndex: indIdx)
            let oldUnitName = UnitKinds.name(curKey)
            r.units[id] = JS(picked.key)

            let oldArmyName = a.name.optionalString ?? ""
            if oldArmyName.isEmpty {
                a.name = JS(picked.name)
            } else if oldArmyName.hasSuffix(oldUnitName) {
                a.name = JS(String(oldArmyName.dropLast(oldUnitName.count)) + picked.name)
            } else if let matchedSuffix = knownNames.first(where: { oldArmyName.hasSuffix($0) }) {
                a.name = JS(String(oldArmyName.dropLast(matchedSuffix.count)) + picked.name)
            }
        }

        if !r.regimes.isNull {
            r.regimes.eraUnitsEnforced = JS(era.rawValue)
        }
    }

    /// 导出当前时代的概要 JSON（供 UI 与命令层读取）。
    public static func eraSummaryJS(_ r: JS) -> JS {
        let era = HistoricalEra.current(r)
        let o = JS.object()
        o.eraId = JS(era.rawValue)
        o.eraTitle = JS(era.title)
        o.eraShortTitle = JS(era.shortTitle)
        o.eraWeapons = JS(era.weapons)
        o.displayYear = JS(HistoricalEra.displayYear(r))
        return o
    }
}
