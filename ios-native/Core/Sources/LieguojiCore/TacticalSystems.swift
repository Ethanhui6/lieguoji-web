import Foundation

/// 陆军深度战术体系（战阵、战场军令、老兵四阶勋阶、陆海补给线与兵种相克明细）
/// 与海军完全体扩展（1–3 级船坞升级、主动新建舰队/定制造舰队列、海域制海权、提督四大专属特技）。
/// 全部规则严格限制在 App 模式（`UnitKinds.enabled && !r.regimes.isNull && r.regimes.enabled.isTruthy`），
/// 保证网页逐字节黄金测试 100% 零改动。
public enum ArmyTactics {
    public enum Formation: String, CaseIterable, Sendable {
        case standard = "standard"
        case wedge    = "wedge"
        case crane    = "crane"
        case phalanx  = "phalanx"
        case skirmish = "skirmish"

        public var label: String {
            switch self {
            case .standard: return "常规阵"
            case .wedge:    return "锋矢突击"
            case .crane:    return "鹤翼包抄"
            case .phalanx:  return "铁壁方阵"
            case .skirmish: return "游击袭扰"
            }
        }
        public var short: String {
            switch self {
            case .standard: return "常规"
            case .wedge:    return "锋矢"
            case .crane:    return "鹤翼"
            case .phalanx:  return "方阵"
            case .skirmish: return "游击"
            }
        }
        public var note: String {
            switch self {
            case .standard: return "均衡攻守，无额外损耗"
            case .wedge:    return "进攻 +16% · 行速 +8% · 防御 −10%（骑兵进攻再 +6%）"
            case .crane:    return "进攻 +10% · 攻城破防 +14% · 粮耗 +10%"
            case .phalanx:  return "防御 +20% · 抗骑冲击 +25% · 行速 −12%"
            case .skirmish: return "行速 +16% · 粮耗 −20% · 恶劣地形损兵减半 · 攻防 −6%"
            }
        }
        public var attackFactor: Double {
            switch self {
            case .standard: return 1.00
            case .wedge:    return 1.16
            case .crane:    return 1.10
            case .phalanx:  return 0.96
            case .skirmish: return 0.94
            }
        }
        public var defenseFactor: Double {
            switch self {
            case .standard: return 1.00
            case .wedge:    return 0.90
            case .crane:    return 1.02
            case .phalanx:  return 1.20
            case .skirmish: return 0.94
            }
        }
        public var siegeFactor: Double {
            switch self {
            case .crane:    return 1.14
            case .wedge:    return 1.06
            case .skirmish: return 0.90
            default:        return 1.00
            }
        }
        public var speedFactor: Double {
            switch self {
            case .standard: return 1.00
            case .wedge:    return 1.08
            case .crane:    return 0.98
            case .phalanx:  return 0.88
            case .skirmish: return 1.16
            }
        }
        public var supplyDrainFactor: Double {
            switch self {
            case .crane:    return 1.10
            case .skirmish: return 0.80
            default:        return 1.00
            }
        }
    }

    public enum FieldOrder: String, CaseIterable, Sendable {
        case normal      = "normal"
        case forcedMarch = "forcedMarch"
        case entrench    = "entrench"
        case scorched    = "scorched"

        public var label: String {
            switch self {
            case .normal:      return "常备军令"
            case .forcedMarch: return "急行军"
            case .entrench:    return "扎营坚壁"
            case .scorched:    return "焦土清野"
            }
        }
        public var note: String {
            switch self {
            case .normal:      return "常规行止与补给节奏"
            case .forcedMarch: return "行速 +35% · 防御 −18% · 每日耗粮 +50% 与士气 −2"
            case .entrench:    return "就地筑垒：防御 +30% · 每日回士气 +6、补粮 +8"
            case .scorched:    return "坚壁清野：防御 +12% · 同州敌军每日额外掉粮 12、士气 −4"
            }
        }
        public var speedFactor: Double {
            switch self {
            case .forcedMarch: return 1.35
            case .entrench:    return 0.45
            default:           return 1.00
            }
        }
        public var defenseFactor: Double {
            switch self {
            case .forcedMarch: return 0.82
            case .entrench:    return 1.30
            case .scorched:    return 1.12
            case .normal:      return 1.00
            }
        }
    }

    public enum SupplyState: String, Sendable {
        case full     = "full"
        case strained = "strained"
        case cut      = "cut"

        public var label: String {
            switch self {
            case .full:     return "补给充沛"
            case .strained: return "补给吃紧"
            case .cut:      return "断粮孤悬"
            }
        }
        public var combatFactor: Double {
            switch self {
            case .full:     return 1.00
            case .strained: return 0.94
            case .cut:      return 0.84
            }
        }
    }

    public static func formation(_ r: JS, armyId: String) -> Formation {
        guard !r.regimes.isNull, !r.regimes.armyTactics.isNull,
              let raw = r.regimes.armyTactics[armyId].formation.optionalString,
              let f = Formation(rawValue: raw) else { return .standard }
        return f
    }

    public static func fieldOrder(_ r: JS, armyId: String) -> FieldOrder {
        guard !r.regimes.isNull, !r.regimes.armyTactics.isNull,
              let raw = r.regimes.armyTactics[armyId].order.optionalString,
              let o = FieldOrder(rawValue: raw) else { return .normal }
        return o
    }

    /// 四阶老兵勋阶称谓（0 新募 / 1 精锐 / 2 百战 / 3 虎贲或近卫）及攻防战力加成。
    public static func veterancyInfo(_ r: JS, armyId: String, nationId: String) -> (rank: Int, label: String, combatPct: Int, battles: Int) {
        let rank = ArmyLedger.rank(r, armyId)
        let battles = (!r.regimes.isNull && !r.regimes.record.isNull) ? Int(r.regimes.record[armyId].battles.optionalNumber ?? 0) : 0
        let civ = r.civilization.nations[nationId]
        let style = r.regimes.isNull ? nil : Regimes.style(r, nationId).id
        let lex = LocalizationEngine.lexicon(culture: civ.cultureId.optionalString, polity: civ.polity.optionalString, style: style)
        let topName = lex.isRepublican ? "近卫劲旅" : "虎贲劲旅"
        let labels = ["新募", "精锐", "百战", topName]
        let bonuses = [0, 8, 16, 26]
        let idx = max(0, min(3, rank))
        return (idx, labels[idx], bonuses[idx], battles)
    }

    /// 实时判定某支军队的陆海补给状态与最近补给来源州索引（供战斗惩罚与大地图绘制陆海补给线）。
    public static func supplyStatus(_ r: JS, army: JS, provinceIndex: Int?) -> (state: SupplyState, originProvince: Int?, reason: String) {
        let id = army.id.asString
        let nation = army.nationId.asString
        let supplies = army.supplies.optionalNumber ?? 100
        let provinces = r.world.provinces.asArray

        if !r.regimes.isNull, !r.regimes.seaSupplyCut.isNull, r.regimes.seaSupplyCut[id].isTruthy {
            return (.cut, nil, "本国海港全遭封锁，海外补给中断（攻防 −16%）")
        }
        guard let q = provinceIndex, provinces.indices.contains(q) else {
            return (supplies < 25 ? .cut : supplies < 55 ? .strained : .full, nil, "渡海航行中，依赖随船口粮")
        }
        let here = provinces[q]
        if RunWindow.access(r, nation, here.controller.asString) {
            return (supplies < 22 ? .strained : .full, q, "驻于本国或友邦境，粮道通畅")
        }
        // 在敌境：寻找邻接的己方/友邦陆路补给州，或未封锁友港海路补给点
        var pidToIndex = [String: Int]()
        for (i, p) in provinces.enumerated() { pidToIndex[p.id.asString] = i }
        for nb in here.neighbors.asArray {
            if let ni = pidToIndex[nb.asString], RunWindow.access(r, nation, provinces[ni].controller.asString) {
                return (supplies < 20 ? .cut : supplies < 55 ? .strained : .full, ni, "由邻州\(provinces[ni].name.asString)陆路输粮")
            }
        }
        // 二跳陆路连通
        for nb in here.neighbors.asArray {
            if let ni = pidToIndex[nb.asString] {
                for nb2 in provinces[ni].neighbors.asArray {
                    if let n2 = pidToIndex[nb2.asString], RunWindow.access(r, nation, provinces[n2].controller.asString) {
                        return (supplies < 25 ? .cut : .strained, n2, "粮道拉长，经\(provinces[n2].name.asString)转运补给")
                    }
                }
            }
        }
        // 海路补给：沿海且本国有未封锁海港
        let unblocked = MaritimeWarfare.unblockedFriendlyPortIndices(r, nation: nation)
        if !unblocked.isEmpty, let sea = Naval.sea, sea.ports.contains(where: { $0.provinceId == here.id.asString }) {
            let src = unblocked.sorted().first
            return (supplies < 22 ? .cut : .strained, src, "经海上补给线接济前线")
        }
        // 无陆海连通：孤军深入敌后，断粮风险极高
        if supplies < 38 {
            return (.cut, nil, "深入敌后且无陆海粮道连通，陷入断粮围困（攻防 −16%）")
        }
        return (.strained, nil, "深入敌后，仅凭随军辎重维持")
    }

    /// 每日结算：战场军令（急行军士气/粮耗、扎营休整回复、焦土坚壁消耗同州敌军）与断粮孤军消耗。
    public static func dailyTick(_ r: JS) {
        guard UnitKinds.enabled, !r.regimes.isNull, r.regimes.enabled.isTruthy else { return }
        guard let bridge = Armies.bridge else { return }
        let space = Armies.space(r)
        let provinces = r.world.provinces.asArray
        var pidToIndex = [String: Int]()
        for (i, p) in provinces.enumerated() { pidToIndex[p.id.asString] = i }

        // 统计执行「焦土坚壁」的驻军所在州
        var scorchedProvinces = [String: Set<String>]() // provinceId -> nations scorching
        for v in space where v.army.troops.asNumber > 0 && v.army.status.asString != "destroyed" {
            let aid = v.army.id.asString
            if fieldOrder(r, armyId: aid) == .scorched, let pid = v.province?.id.asString {
                scorchedProvinces[pid, default: []].insert(v.army.nationId.asString)
            }
        }

        for v in space {
            let a = v.army
            guard a.troops.asNumber > 0 && a.status.asString != "destroyed" else { continue }
            let aid = a.id.asString
            let nation = a.nationId.asString
            let form = formation(r, armyId: aid)
            let order = fieldOrder(r, armyId: aid)
            let pIdx = v.province.flatMap { pidToIndex[$0.id.asString] }
            let sup = supplyStatus(r, army: a, provinceIndex: pIdx)
            let moving = v.travel.status.asString == "moving"

            var supplies = a.supplies.optionalNumber ?? 100
            var morale = a.morale.optionalNumber ?? 100

            // 战阵粮耗差异
            if form.supplyDrainFactor > 1.01 { supplies = max(0, supplies - 0.8) }
            else if form.supplyDrainFactor < 0.9 { supplies = min(100, supplies + 0.6) }

            // 军令效果
            switch order {
            case .forcedMarch:
                if moving {
                    supplies = max(0, supplies - 2.6)
                    morale = max(18, morale - 2.0)
                }
            case .entrench:
                if !moving && a.status.asString != "fighting" {
                    morale = min(100, morale + 6.0)
                    supplies = min(100, supplies + 8.0)
                }
            case .scorched:
                if !moving {
                    supplies = max(0, supplies - 1.2)
                }
            case .normal:
                break
            }

            // 遭敌军「焦土清野」消耗
            if let pid = v.province?.id.asString, let scorchers = scorchedProvinces[pid] {
                if scorchers.contains(where: { $0 != nation && Wars.relation(r, nation, $0)?.status.asString == "war" }) {
                    supplies = max(0, supplies - 12.0)
                    morale = max(12, morale - 4.0)
                }
            }

            // 断粮孤军真实减员与士气滑坡（保留 25% 最低残部防无故蒸发）
            if sup.state == .cut && a.status.asString != "retreating" {
                let cur = a.troops.asNumber
                let full = max(cur, r.tactics.forces[aid].fullStrength.optionalNumber ?? cur)
                let floorTroops = max(80.0, (full * 0.25).rounded(.down))
                if cur > floorTroops {
                    let drop = max(1.0, (cur * 0.015).rounded(.down))
                    a.troops = JS(max(floorTroops, cur - drop))
                }
                morale = max(15, morale - 3.5)
            }

            // 特产「粮食」提升全军在己境补给恢复
            if let q = pIdx, provinces[q].controller.asString == nation, Trade.holdings(r, nation)[0, default: 0] > 0 {
                supplies = min(100, supplies + 2.5)
            }

            a.supplies = JS(supplies)
            a.morale = JS(morale)
            _ = bridge
        }
    }

    /// 兵种相克结构化清单（强克与被克），供军团页与战局卡直观展示。
    public static func counterReport(for unitKey: String) -> (strong: [String], weak: [String]) {
        let probes: [(String, String)] = [
            ("Infantry", "步兵"), ("Spear", "枪兵"), ("Shield", "盾兵"),
            ("Archer", "弓兵"), ("Crossbow", "弩兵"), ("Cavalry", "骑兵"),
            ("HeavyCavalry", "重骑"), ("HorseArcher", "骑射"), ("Elephant", "战象")
        ]
        var strong = [String]()
        var weak = [String]()
        for (k, label) in probes {
            let atk = UnitKinds.counter(unitKey, k)
            if atk >= 1.15 {
                strong.append("\(label) +\(Int(((atk - 1) * 100).rounded()))%")
            }
            let def = UnitKinds.counter(k, unitKey)
            if def >= 1.20 {
                weak.append("畏\(label) −\(Int(((def - 1) * 100).rounded()))%")
            }
        }
        return (Array(strong.prefix(3)), Array(weak.prefix(3)))
    }
}

/// 海军深度完全体引擎：1–3 级海港船坞升级、主动新建舰队/定制三舰种造舰队列、海域制海权与水师提督四大专属特技。
public enum SeaDominion {
    public enum AdmiralSkill: String, CaseIterable, Sendable {
        case fireAttack     = "fireAttack"
        case windGauge      = "windGauge"
        case ironChain      = "ironChain"
        case commerceRaider = "commerceRaider"

        public var label: String {
            switch self {
            case .fireAttack:     return "火攻奇袭"
            case .windGauge:      return "顺风抢风"
            case .ironChain:      return "铁链锁港"
            case .commerceRaider: return "破交猎杀"
            }
        }
        public var note: String {
            switch self {
            case .fireAttack:     return "正面海战火力 +18%，并令敌舰船体额外灼伤"
            case .windGauge:      return "舰队航速 +22%，规避炮火减伤 14%"
            case .ironChain:      return "封锁半径 +30%，封港截夺商税与战分压制 +40%"
            case .commerceRaider: return "截杀敌方跨海运兵船队与敌商路伤害 +40%"
            }
        }
        public static func pick(traits: [String], military: Double, seed: Int) -> AdmiralSkill {
            if traits.contains("NavalMastery") { return .fireAttack }
            if traits.contains("ShipMaster") { return .windGauge }
            if traits.contains("Cruel") || traits.contains("Ambitious") { return .commerceRaider }
            if traits.contains("Patient") || traits.contains("Stubborn") { return .ironChain }
            let all = AdmiralSkill.allCases
            return all[abs(Int(military) + seed) % all.count]
        }
    }

    public static let crewPerShip = 200
    public static let foodPerShip = 12_000

    /// 某海港州郡的船坞等级（1–3 级；未升级默认为 1 级，同时兼容州郡 5 类基建槽 `shipyard`）。
    public static func shipyardLevel(_ r: JS, provinceId: String) -> Int {
        guard !r.regimes.isNull else { return 1 }
        let infraLvl = (!r.regimes.infra.isNull && !r.regimes.infra[provinceId].isNull)
            ? (r.regimes.infra[provinceId].shipyard.optionalNumber.map(Int.init) ?? 0) : 0
        let dockLvl = (!r.regimes.shipyard.isNull && !r.regimes.shipyard.levels.isNull)
            ? (r.regimes.shipyard.levels[provinceId].optionalNumber.map(Int.init) ?? 1) : 1
        return max(1, min(3, max(dockLvl, infraLvl + 1)))
    }

    /// 按港口船坞等级决定单支舰队可扩编最大战船数（1 级 5 艘 / 2 级 8 艘 / 3 级 12 艘）。
    public static func maxShipsForPort(_ r: JS, provinceId: String?) -> Int {
        guard let pid = provinceId, !pid.isEmpty else { return 5 }
        switch shipyardLevel(r, provinceId: pid) {
        case 3: return 12
        case 2: return 8
        default: return 5
        }
    }

    /// 某国在某港口的造舰耗时倍率（船坞等级 + 良木特产 + 航海科技）。
    public static func buildTimeMultiplier(_ r: JS, nation: String, provinceId: String?) -> Double {
        var mult = 1.0
        if let pid = provinceId {
            let lvl = shipyardLevel(r, provinceId: pid)
            if lvl == 2 { mult *= 0.78 }
            else if lvl >= 3 { mult *= 0.58 }
        }
        // 战略特产「良木」（索引 1）缩短造舰耗时 20%
        if Trade.holdings(r, nation)[1, default: 0] > 0 { mult *= 0.80 }
        // 航海科技每升一阶缩短造舰 8%
        let navTech = WorldDepth.techLevel(r, nation: nation, branch: .naval)
        if navTech > 1 { mult *= max(0.65, 1.0 - Double(navTech - 1) * 0.08) }
        return max(0.35, mult)
    }

    /// 实时海域制海权评分（0…100%）：
    /// 交战时对比己方与全部交战敌国海上战力；和平时对比世界主要海军强国均值。
    public struct SeaControlReport: Sendable {
        public let score: Int        // 0...100
        public let label: String     // 霸海独尊 / 制海优势 / 势均力敌 / 制海劣势 / 无水师
        public let tradeBonusPct: Int // +0 / +15 / +20 / +30
        public let embarkSpeedPct: Int // +0 / +15 / +25
        public let myPower: Int
        public let rivalPower: Int
    }

    public static func seaControl(_ r: JS, nation: String) -> SeaControlReport {
        guard !r.navy.isNull, !r.navy.fleets.isNull else {
            return SeaControlReport(score: 0, label: "无水师", tradeBonusPct: 0, embarkSpeedPct: 0, myPower: 0, rivalPower: 0)
        }
        func fleetScore(_ fl: JS) -> Double {
            guard fl.status.asString != "lost", fl.ships.asInt > 0 else { return 0 }
            let meta = MaritimeWarfare.fleetMeta(r, fleet: fl)
            let hull = r.maritime.hulls[fl.id.asString].optionalNumber ?? Double(fl.ships.asInt * 100)
            let hullRatio = max(0.2, min(1.0, hull / Double(max(1, fl.ships.asInt * 100))))
            let weighted = Double(meta.heavy) * 1.45 + Double(meta.light) * 1.05 + Double(meta.gunboats) * 0.95
            let adm = 1.0 + Double(meta.admiralBonus) / 100.0 + Double(meta.rank) * 0.08
            return weighted * hullRatio * adm
        }
        var byNation = [String: Double]()
        for fl in r.navy.fleets.asArray {
            let s = fleetScore(fl)
            if s > 0 { byNation[fl.nationId.asString, default: 0] += s }
        }
        let my = byNation[nation] ?? 0
        if my <= 0.01 {
            return SeaControlReport(score: 0, label: "无水师", tradeBonusPct: 0, embarkSpeedPct: 0, myPower: 0, rivalPower: Int((byNation.values.max() ?? 0).rounded()))
        }
        // 查找交战敌国
        var enemyPower = 0.0
        var hasWar = false
        for rel in r.world.statecraft.relations.asArray where rel.status.asString == "war" {
            let a = rel.a.asString, b = rel.b.asString
            if a == nation { hasWar = true; enemyPower += byNation[b] ?? 0 }
            else if b == nation { hasWar = true; enemyPower += byNation[a] ?? 0 }
        }
        let rival: Double
        if hasWar {
            rival = max(0.5, enemyPower)
        } else {
            let others = byNation.filter { $0.key != nation }.map(\.value)
            rival = others.isEmpty ? my * 0.5 : (others.reduce(0, +) / Double(others.count))
        }
        let pct = Int((my / max(0.1, my + rival) * 100.0).rounded())
        let clamped = max(0, min(100, pct))
        let label: String
        let tradePct: Int
        let speedPct: Int
        if clamped >= 80 { label = "霸海独尊"; tradePct = 30; speedPct = 25 }
        else if clamped >= 65 { label = "制海优势"; tradePct = 20; speedPct = 20 }
        else if clamped >= 45 { label = "势均力敌"; tradePct = 10; speedPct = 10 }
        else { label = "制海劣势"; tradePct = 0; speedPct = 0 }
        return SeaControlReport(score: clamped, label: label, tradeBonusPct: tradePct, embarkSpeedPct: speedPct, myPower: Int(my.rounded()), rivalPower: Int(rival.rounded()))
    }

    /// 舰队月度造舰排产队列推进（扩编指定舰种或新建完整舰队下水）。
    public static func advanceBuildQueue(_ r: JS) {
        guard UnitKinds.enabled, !r.regimes.isNull, r.regimes.enabled.isTruthy,
              !r.regimes.shipyard.isNull, !r.regimes.shipyard.orders.isNull,
              let sea = Naval.sea else { return }
        let provinces = r.world.provinces.asArray
        var remaining = [JS]()
        for order in r.regimes.shipyard.orders.asArray {
            let nation = order.nation.asString
            let pid = order.provinceId.asString
            guard Vassals.alive(r, nation),
                  provinces.first(where: { $0.id.asString == pid })?.controller.asString == nation else { continue }
            let left = (order.monthsLeft.optionalNumber ?? 1) - 1.0
            if left > 0.05 {
                order.monthsLeft = JS(left)
                remaining.append(order)
                continue
            }
            let h = order.heavy.asInt, l = order.light.asInt, g = order.gunboats.asInt
            let total = max(1, h + l + g)
            let targetFleetId = order.fleetId.optionalString ?? ""
            if !targetFleetId.isEmpty, let fl = Naval.fleets(r).first(where: { $0.id.asString == targetFleetId && $0.status.asString != "lost" }) {
                let cap = maxShipsForPort(r, provinceId: pid)
                let cur = fl.ships.asInt
                let add = max(0, min(total, cap - cur))
                if add > 0 {
                    fl.ships = JS(cur + add)
                    fl.crew = JS(fl.crew.asInt + add * crewPerShip)
                    fl.food = JS(fl.food.asInt + add * foodPerShip)
                    r.maritime.hulls[targetFleetId] = JS((r.maritime.hulls[targetFleetId].optionalNumber ?? Double(cur * 100)) + Double(add * 100))
                    _ = MaritimeWarfare.fleetMeta(r, fleet: fl)
                    let rec = r.regimes.fleetMeta[targetFleetId]
                    rec.heavy = JS(rec.heavy.asInt + min(h, add))
                    let rem1 = max(0, add - min(h, add))
                    rec.light = JS(rec.light.asInt + min(l, rem1))
                    let rem2 = max(0, rem1 - min(l, rem1))
                    rec.gunboats = JS(rec.gunboats.asInt + rem2)
                    _ = People.announce(r, kind: "event", text: "\(fl.name.asString)新舰下水入列（+\(add) 艘）",
                                        reason: "船坞排产完工，新造主力 \(min(h, add)) · 巡弋 \(min(l, rem1)) · 炮舰 \(rem2) 编入水师。",
                                        nations: [nation], province: pid)
                }
            } else if let port = sea.ports.first(where: { $0.provinceId == pid }) {
                _ = launchNewFleet(r, nation: nation, port: port, heavy: h, light: l, gunboats: g, customName: order.name.optionalString)
            }
        }
        r.regimes.shipyard.orders = .array(remaining)
    }

    /// 在指定海港正式下水一支全新舰队（写入全部引擎表，确保零越界、立即可指挥）。
    @discardableResult
    public static func launchNewFleet(_ r: JS, nation: String, port: Naval.Port, heavy: Int, light: Int, gunboats: Int, customName: String? = nil) -> JS? {
        guard !r.navy.isNull, !r.fleetPositions.isNull, !r.maritime.isNull, !r.portControl.isNull, !r.navalAutonomy.isNull else { return nil }
        let total = max(1, min(12, heavy + light + gunboats))
        let fid = "fleet-custom-\(r.world.day.asInt)-\(r.navy.fleets.length)"
        let provName = r.world.cities.asArray.first { $0.provinceId.asString == port.provinceId }?.name.asString
            ?? r.world.provinces.asArray.first { $0.id.asString == port.provinceId }?.name.asString ?? "海港"
        let ownCount = Naval.fleets(r).filter { $0.nationId.asString == nation }.count
        let ordinals = ["一", "二", "三", "四", "五", "六", "七", "八", "九", "十"]
        let ord = ownCount < ordinals.count ? ordinals[ownCount] : "\(ownCount + 1)"
        let fname = (customName?.isEmpty == false) ? customName! : "\(provName)第\(ord)水师"
        let crew = total * crewPerShip
        let food = total * foodPerShip

        let fl = JS.object()
        fl.id = JS(fid); fl.name = JS(fname); fl.nationId = JS(nation)
        fl.ships = JS(total); fl.crew = JS(crew); fl.food = JS(food)
        fl.node = JS(port.node); fl.route = .array(); fl.progress = JS(0)
        fl.dockId = JS(port.id); fl.targetId = .null; fl.patrol = JS(true); fl.status = JS("docked")
        r.navy.fleets.push(fl)

        let rec = JS.object()
        rec.version = JS(1); rec.armyId = JS(fid)
        let pt = JS.object(); pt.x = JS(port.center.x); pt.y = JS(port.center.y)
        rec.origin = pt; rec.nodes = .array([JS(port.node * 2 + 1)])
        rec.leg = JS(0); rec.offset = JS(0); rec.crossed = JS(false); rec.status = JS("arrived")
        r.fleetPositions.records[fid] = rec

        r.maritime.hulls[fid] = JS(Double(total * 100))

        let pf = JS.object()
        pf.targetId = .null; pf.forwardBaseId = .null; pf.active = JS(false); pf.lastWar = JS(false); pf.nextTick = r.clock.tick.clone()
        r.portControl.fleets[fid] = pf

        let nf = JS.object()
        nf.homePortId = JS(port.id); nf.assignedPortId = .null; nf.nextTick = r.clock.tick.clone(); nf.issuedTick = .null
        nf.decision = JS("waiting"); nf.reason = JS("新编舰队下水，待命巡海。")
        r.navalAutonomy.fleets[fid] = nf

        if !r.regimes.isNull {
            if r.regimes.fleetMeta.isNull { r.regimes.fleetMeta = .object() }
            let meta = JS.object()
            meta.mission = JS("patrol"); meta.heavy = JS(heavy); meta.light = JS(light); meta.gunboats = JS(gunboats); meta.xp = JS(0)
            r.regimes.fleetMeta[fid] = meta
        }
        Shipyards.remember(r)
        Vassals.bump(r.fleetPositions); Vassals.bump(r.portControl); Vassals.bump(r.navalAutonomy)
        _ = People.announce(r, kind: "event", text: "\(fname)于\(provName)港建成下水（\(total) 艘）",
                            reason: "新造主力 \(heavy) · 巡弋 \(light) · 炮舰 \(gunboats) 战舰成军，强化海域制海权。",
                            nations: [nation], province: port.provinceId)
        return fl
    }
}

// MARK: - NativeEngine 陆海深度战术命令接口

extension NativeEngine {
    /// 切换陆军战术战阵（standard / wedge / crane / phalanx / skirmish）。
    public func setArmyFormation(_ id: String, formation raw: String) -> (ok: Bool, reason: String) {
        let r = run
        guard let a = r.world.armies.asArray.first(where: { $0.id.asString == id && $0.troops.asNumber > 0 && $0.status.asString != "destroyed" }) else {
            return (false, "军队不存在或已覆灭。")
        }
        guard let f = ArmyTactics.Formation(rawValue: raw) else { return (false, "未知战阵类型。") }
        Regimes.enable(r)
        if r.regimes.armyTactics.isNull { r.regimes.armyTactics = .object() }
        if r.regimes.armyTactics[id].isNull { r.regimes.armyTactics[id] = .object() }
        r.regimes.armyTactics[id].formation = JS(f.rawValue)
        return (true, "\(a.name.asString)变阵为「\(f.label)」：\(f.note)")
    }

    /// 下达陆军战场军令（normal / forcedMarch / entrench / scorched）。
    public func setArmyFieldOrder(_ id: String, order raw: String) -> (ok: Bool, reason: String) {
        let r = run
        guard let a = r.world.armies.asArray.first(where: { $0.id.asString == id && $0.troops.asNumber > 0 && $0.status.asString != "destroyed" }) else {
            return (false, "军队不存在或已覆灭。")
        }
        guard let o = ArmyTactics.FieldOrder(rawValue: raw) else { return (false, "未知战场军令。") }
        Regimes.enable(r)
        if r.regimes.armyTactics.isNull { r.regimes.armyTactics = .object() }
        if r.regimes.armyTactics[id].isNull { r.regimes.armyTactics[id] = .object() }
        r.regimes.armyTactics[id].order = JS(o.rawValue)
        if o == .entrench && r.armyPositions.records[id].status.asString == "moving" {
            _ = order(armyId: id, provinceIndex: -1)
        }
        return (true, "\(a.name.asString)奉行「\(o.label)」：\(o.note)")
    }

    /// 升级海港船坞（1 → 2 级耗 260 金；2 → 3 级耗 480 金）。
    public func upgradeShipyard(provinceIndex: Int) -> (ok: Bool, reason: String) {
        let r = run
        let provinces = r.world.provinces.asArray
        guard provinces.indices.contains(provinceIndex) else { return (false, "州郡不存在。") }
        let p = provinces[provinceIndex], pid = p.id.asString, nation = p.controller.asString
        guard let sea = Naval.sea, sea.ports.contains(where: { $0.provinceId == pid }) else {
            return (false, "\(p.name.asString)非沿海良港，无法扩建船坞。")
        }
        Regimes.enable(r)
        let cur = SeaDominion.shipyardLevel(r, provinceId: pid)
        guard cur < 3 else { return (false, "\(p.name.asString)船坞已达最高 3 级（巨型御用造船厂）。") }
        let cost = cur == 1 ? 260.0 : 480.0
        let fin = r.finance.nations[nation]
        let gold = fin.isNull ? 0 : (fin.gold.optionalNumber ?? 0)
        guard gold >= cost else { return (false, "国库不足（升级至 \(cur + 1) 级船坞需 \(Int(cost)) 金）。") }
        fin.gold = JS(gold - cost)
        let book = Shipyards.book(r)
        if book.levels.isNull { book.levels = .object() }
        book.levels[pid] = JS(cur + 1)
        if r.regimes.infra.isNull { r.regimes.infra = .object() }
        if r.regimes.infra[pid].isNull { r.regimes.infra[pid] = .object() }
        r.regimes.infra[pid].shipyard = JS(cur) // infra 0/1/2/3 synced
        let nextCap = SeaDominion.maxShipsForPort(r, provinceId: pid)
        _ = People.announce(r, kind: "event", text: "\(p.name.asString)海港船坞扩建至 \(cur + 1) 级",
                            reason: "耗金 \(Int(cost)) 扩修干船坞，单舰队泊位上限增至 \(nextCap) 艘，造舰与修船大幅提速。",
                            nations: [nation], province: pid)
        return (true, "\(p.name.asString)船坞升至 \(cur + 1) 级（最大编制 \(nextCap) 艘，耗金 \(Int(cost))）。")
    }

    /// 主动下令在港口船坞排产新舰队或为现役舰队定制造舰（spec: "heavy,light,gunboats"）。
    public func queueShipbuilding(nationIndex: Int, provinceIndex: Int, fleetId: String? = nil, spec: String) -> (ok: Bool, reason: String) {
        let r = run
        let nations = r.world.nations.asArray, provinces = r.world.provinces.asArray
        guard nations.indices.contains(nationIndex) else { return (false, "国家不存在。") }
        let nid = nations[nationIndex].id.asString
        guard let sea = Naval.sea else { return (false, "该世界未启用海港与水师。") }
        // 若未指定合法海港，自动挑选本国最高等级的未封锁海港
        let targetPid: String
        if provinces.indices.contains(provinceIndex),
           provinces[provinceIndex].controller.asString == nid,
           sea.ports.contains(where: { $0.provinceId == provinces[provinceIndex].id.asString }) {
            targetPid = provinces[provinceIndex].id.asString
        } else {
            let unblocked = MaritimeWarfare.unblockedFriendlyPortIndices(r, nation: nid)
            guard let bestIdx = unblocked.sorted(by: {
                SeaDominion.shipyardLevel(r, provinceId: provinces[$0].id.asString) > SeaDominion.shipyardLevel(r, provinceId: provinces[$1].id.asString)
            }).first else {
                return (false, "该国当前没有未被封锁的本国海港可供造舰。")
            }
            targetPid = provinces[bestIdx].id.asString
        }
        guard !MaritimeWarfare.isPortBlockaded(r, provinceId: targetPid, landOwner: nid) else {
            return (false, "目标海港正遭敌舰封锁，无法开工造舰。")
        }
        let parts = spec.split(separator: ",").compactMap { Int($0.trimmingCharacters(in: .whitespaces)) }
        guard parts.count == 3 else { return (false, "造舰编成参数无效。") }
        let h = max(0, parts[0]), l = max(0, parts[1]), g = max(0, parts[2])
        let total = h + l + g
        guard (1...6).contains(total) else { return (false, "单批造舰须为 1 至 6 艘。") }

        let timberDiscount = Trade.holdings(r, nid)[1, default: 0] > 0 ? 0.85 : 1.0
        let rawCost = Double(h * 140 + l * 95 + g * 105) * timberDiscount
        let cost = rawCost.rounded()
        let fin = r.finance.nations[nid]
        let gold = fin.isNull ? 0 : (fin.gold.optionalNumber ?? 0)
        guard gold >= cost else { return (false, "国库不足（造舰需 \(Int(cost)) 金）。") }
        fin.gold = JS(gold - cost)

        Regimes.enable(r)
        let book = Shipyards.book(r)
        if book.orders.isNull { book.orders = .array() }
        let months = max(1.0, (Shipyards.buildMonths(r, nid, provinceId: targetPid) * (0.65 + 0.35 * Double(total))).rounded(.up))
        let order = JS.object()
        order.nation = JS(nid); order.provinceId = JS(targetPid)
        order.heavy = JS(h); order.light = JS(l); order.gunboats = JS(g)
        order.monthsLeft = JS(months)
        if let fleetId, !fleetId.isEmpty { order.fleetId = JS(fleetId) }
        book.orders.push(order)

        let pName = provinces.first { $0.id.asString == targetPid }?.name.asString ?? "船坞"
        let actionWord = (fleetId?.isEmpty == false) ? "扩编排产" : "新建水师排产"
        return (true, "\(pName)船坞已承接\(actionWord)：主力 \(h)·巡弋 \(l)·炮舰 \(g)（耗金 \(Int(cost))，预计 \(Int(months)) 个月下水）。")
    }
}
