import Foundation

/// Proleptic Gregorian calendar (src/fms/play/native-economy/iso-calendar.ts): no time zones, years
/// −9998…9999, the game starting on 1 January of year 1.
public struct IsoDate: Equatable, Sendable {
    public let year: Int, month: Int, day: Int
    public init(year: Int, month: Int, day: Int) { self.year = year; self.month = month; self.day = day }

    static func leap(_ y: Int) -> Bool { y % 4 == 0 && (y % 100 != 0 || y % 400 == 0) }
    static func monthLength(_ y: Int, _ m: Int) -> Int { m == 2 ? (leap(y) ? 29 : 28) : [4, 6, 9, 11].contains(m) ? 30 : 31 }
    /// Math.floor division as the TypeScript source uses it, also for negative years.
    static func floorDiv(_ a: Int, _ b: Int) -> Int { let q = a / b; return (a % b != 0 && (a < 0) != (b < 0)) ? q - 1 : q }
    static func startOfYear(_ year: Int) -> Int { let y = year - 1; return 365 * y + floorDiv(y, 4) - floorDiv(y, 100) + floorDiv(y, 400) }
    var dayNumber: Int {
        var result = IsoDate.startOfYear(year) + day - 1
        for m in 1..<month { result += IsoDate.monthLength(year, m) }
        return result
    }
    static func from(dayNumber day: Int) -> IsoDate {
        var low = -9998, high = 9999
        while low < high { let middle = Int((Double(low + high) / 2).rounded(.up)); if startOfYear(middle) <= day { low = middle } else { high = middle - 1 } }
        var remaining = day - startOfYear(low), month = 1
        while remaining >= monthLength(low, month) { remaining -= monthLength(low, month); month += 1 }
        return IsoDate(year: low, month: month, day: remaining + 1)
    }
    public func plus(days: Int) -> IsoDate { IsoDate.from(dayNumber: dayNumber + days) }
    public static let start = IsoDate(year: 1, month: 1, day: 1)
    /// The web's date display (CultureCalendar47): 公元1年1月1日.
    public var text: String { year > 0 ? "公元\(year)年\(month)月\(day)日" : "公元前\(1 - year)年\(month)月\(day)日" }
    public var shortText: String { "\(year)年\(month)月\(day)日" }
}

/// Simulation start exported from the web run (src/native-export/native-state.ts).
public struct EconomyStart: Codable, Sendable {
    public struct Province: Codable, Sendable {
        public let province: Int; public let nation: Int; public let terrain: String; public let supply: Double
        public let capacity: Int; public let population: Int; public let grain: Int
    }
    public struct Nation: Codable, Sendable { public let priority: String }
    public struct Army: Codable, Sendable {
        public let id: String; public let name: String; public let nation: Int; public let province: Int; public let troops: Int
        public let status: String; public let travel: String; public let supplies: Double; public let morale: Double
        public let unit: String; public let x: Float; public let y: Float
    }
    public let day: Int
    public let provinces: [Province]
    public let nations: [Nation]
    public let wars: [[Int]]
    public let armies: [Army]
}

/// The mutable world the Swift engine owns. Only modules already ported to Swift change it; the rest
/// of the web's daily pipeline (people, fiscal month, muster, destiny, AI, war) is not run yet.
public struct SimState: Sendable, Equatable {
    public static let ticksPerDay = 120
    public struct Province: Sendable, Equatable {
        public let province: Int; public var nation: Int; public let terrain: String; public let supply: Double
        public var capacity: Int; public var population: Int; public var grain: Int
    }
    public struct Army: Sendable, Equatable {
        public let id: String; public var nation: Int; public var province: Int; public var troops: Int
        public var status: String; public var travel: String; public var supplies: Double; public var morale: Double
    }
    /// NationPolicy.lastLedger: the day's grain account of one nation.
    public struct Ledger: Sendable, Equatable {
        public var openingGrain = 0, production = 0, civilianConsumed = 0, militaryConsumed = 0, closingGrain = 0, starvationDeaths = 0
        public init() {}
    }
    public var tick: Int
    public var day: Int
    public var provinces: [Province]
    public var priorities: [String]
    public var wars: Set<[Int]>
    public var armies: [Army]
    public var ledgers: [Ledger]
    public var treasuries: [NationTreasury]
    /// Static per-province month-end inputs by world province index (cells, resources, governor multiplier).
    public let provinceStatics: [Int: MonthlyStart.Province]
    /// Army journeys (nil without a travel graph).
    public var motion: ArmyMotion?
    public let worldProvinces: Int

    public init(start: EconomyStart, monthly: [MonthlyStart] = [], worldProvinces: Int = 0, motion: ArmyMotion? = nil) {
        self.motion = motion
        day = start.day; tick = start.day * SimState.ticksPerDay
        provinces = start.provinces.map { Province(province: $0.province, nation: $0.nation, terrain: $0.terrain, supply: $0.supply, capacity: $0.capacity, population: $0.population, grain: $0.grain) }
        priorities = start.nations.map(\.priority)
        wars = Set(start.wars.flatMap { [[$0[0], $0[1]], [$0[1], $0[0]]] })
        armies = start.armies.map { Army(id: $0.id, nation: $0.nation, province: $0.province, troops: $0.troops, status: $0.status, travel: $0.travel, supplies: $0.supplies, morale: $0.morale) }
        ledgers = Array(repeating: Ledger(), count: start.nations.count)
        treasuries = monthly.map { m in
            NationTreasury(gold: m.gold, goldPerMonth: 0, goldBattleModifier: 1, lastMonth: m.lastMonth,
                           destiny: Destiny.State(destiny: m.destiny.destiny, decrease: m.destiny.decrease, manifestCount: m.destiny.manifestCount, manifest: m.destiny.manifest, seed: m.destiny.seed, lastMonth: m.destiny.lastMonth),
                           ethnic: m.ethnic, goldProduction: m.goldProduction, tax: m.tax, central: m.central, administrative: m.administrative)
        }
        var statics: [Int: MonthlyStart.Province] = [:]
        for m in monthly { for p in m.provinces { statics[p.province] = p } }
        provinceStatics = statics
        self.worldProvinces = worldProvinces
    }
    public var date: IsoDate { IsoDate.start.plus(days: day) }
    public func atWar(_ a: Int, _ b: Int) -> Bool { wars.contains([a, b]) }
}

/// war47-economy.ts createArmyEconomy47.advanceEconomy, line by line (Double arithmetic as JavaScript,
/// Math.floor / Math.ceil as floor / ceil). Armies on a province's land refill from its granary
/// in id order; occupied (contested) provinces produce half and refill nothing.
public enum DailyEconomy {
    public static let maxGrain = 1_000_000_000_000
    /// LOGISTICS_DAY_FACTOR47: a 30-tick logistics day.
    public static let dayFactor = 1.0 / 30.0

    static func rationPoints(_ a: SimState.Army, _ dayFactor: Double) -> Double {
        if a.status == "fighting" { return 8 * dayFactor }
        if a.status == "retreating" { return 5 * dayFactor }
        return (a.travel == "moving" || a.travel == "blocked" ? 6 : 4) * dayFactor
    }
    static func canRefill(_ a: SimState.Army) -> Bool { a.province >= 0 && a.status == "idle" && (a.travel == "arrived" || a.travel == "halted") }
    static func factor(_ terrain: String) -> Double { terrain == "plain" ? 1.12 : terrain == "forest" ? 1.04 : 0.82 }

    public static func advance(_ s: inout SimState, dayFactor: Double = DailyEconomy.dayFactor) {
        var onLand: [Int: [Int]] = [:]
        for (i, a) in s.armies.enumerated() where a.province >= 0 { onLand[a.province, default: []].append(i) }
        for i in s.armies.indices { s.armies[i].supplies = max(0, s.armies[i].supplies - rationPoints(s.armies[i], dayFactor)) }
        for n in s.ledgers.indices { s.ledgers[n] = SimState.Ledger() }
        for e in s.provinces.indices {
            let economy = s.provinces[e], n = economy.nation
            let population = economy.population
            let occupied = (onLand[economy.province] ?? []).contains { s.atWar(s.armies[$0].nation, n) }
            s.ledgers[n].openingGrain += economy.grain
            let production = Int(floor(Double(min(population, economy.capacity)) * factor(economy.terrain) * (occupied ? 0.5 : 1)))
            let produced = min(maxGrain - economy.grain, production)
            s.provinces[e].grain += produced; s.ledgers[n].production += produced
            func refill(_ reserve: Int) {
                if occupied { return }
                let local = (onLand[economy.province] ?? []).filter { canRefill(s.armies[$0]) && s.armies[$0].nation == n }.sorted { s.armies[$0].id < s.armies[$1].id }
                for i in local {
                    let strength = Double(s.armies[i].troops) / 10
                    let available = Double(max(0, s.provinces[e].grain - reserve)) * 6 / strength
                    let points = max(0, floor(min(economy.supply, 100 - s.armies[i].supplies, available)))
                    let consumed = Int(ceil(points * strength / 6))
                    s.provinces[e].grain -= consumed; s.ledgers[n].militaryConsumed += consumed; s.armies[i].supplies += points
                }
            }
            let priority = s.priorities[n]
            if priority == "military" { refill(0) }
            let consumed = min(s.provinces[e].grain, population)
            s.provinces[e].grain -= consumed; s.ledgers[n].civilianConsumed += consumed
            let shortage = population - consumed
            let deaths = shortage > 0 ? min(population, Int(ceil(Double(shortage) * 0.002))) : 0
            s.provinces[e].population -= deaths; s.ledgers[n].starvationDeaths += deaths
            if shortage == 0 && population < economy.capacity { s.provinces[e].population = min(economy.capacity, population + Int(floor(Double(population) * 0.0001))) }
            if priority != "military" { refill(population * (priority == "civilian" ? 3 : 1)) }
            s.ledgers[n].closingGrain += s.provinces[e].grain
        }
    }

    /// civilization47-original-army settleOriginalArmyDay47: original armies carry no rations.
    public static func originalArmyReset(_ s: inout SimState) {
        for i in s.armies.indices where s.armies[i].troops > 0 && s.armies[i].status != "destroyed" { s.armies[i].supplies = 100; s.armies[i].morale = 100 }
    }
}

/// Owns the state off the main thread. Each day runs the ported modules in the web's order
/// (settleCivilizationDay47: … army economy → original-army reset …).
/// civilization47-fiscal settleFiscalMonth47 then destiny20-state settleDestinyMonth, every 30th day.
public enum MonthEnd {
    public static func settle(_ s: inout SimState) {
        guard s.day % 30 == 0, !s.treasuries.isEmpty else { return }
        let month = s.day / 30
        for n in s.treasuries.indices {
            let owned = s.provinces.filter { $0.nation == n }
            var t = s.treasuries[n]
            if t.lastMonth < month && !owned.isEmpty {
                let incomes = owned.compactMap { p -> Int? in
                    guard let st = s.provinceStatics[p.province] else { return nil }
                    return Treasury.provinceIncome(Treasury.ProvinceInput(population: p.population, capacity: p.capacity, cells: st.cells, resources: st.resources, local: st.local),
                                                   ethnic: t.ethnic, destiny: t.destiny.destiny, nationProvinces: owned.count, worldProvinces: s.worldProvinces)
                }
                // Army costs need real movement (monthlyArmyFees47): armies do not move yet, so none accrue.
                let r = Treasury.settle(gold: t.gold, incomes: incomes, tax: t.tax, central: t.central, armyCost: 0, production: t.goldProduction, ethnic: t.ethnic)
                t.gold = r.gold; t.goldPerMonth = r.goldPerMonth; t.goldBattleModifier = r.goldBattleModifier; t.lastMonth = month
            }
            let capacity = owned.reduce(0) { $0 + $1.capacity }, population = owned.reduce(0) { $0 + $1.population }
            if t.destiny.lastMonth < month && capacity > 0 {
                let ratio = Native.fr(Native.fr(Double(population)) / Native.fr(Double(capacity)))
                _ = Destiny.month(&t.destiny, populationRatio: ratio, gold: t.gold, leaderAdministrative: t.administrative)
                t.destiny.lastMonth = month
            }
            s.treasuries[n] = t
        }
    }
}

public actor Simulation {
    public private(set) var state: SimState
    public init(start: EconomyStart, monthly: [MonthlyStart] = [], worldProvinces: Int = 0, motion: ArmyMotion? = nil) { state = SimState(start: start, monthly: monthly, worldProvinces: worldProvinces, motion: motion) }
    public func order(army: Int, toProvince province: Int) -> (SimState, SimState.OrderError?) { let e = state.order(army: army, toProvince: province); return (state, e) }
    public func halt(army: Int) -> SimState { state.halt(army: army); return state }
    public func advance(days: Int) -> SimState {
        for _ in 0..<max(0, days) {
            state.advanceMotion()
            state.day += 1; state.tick = state.day * SimState.ticksPerDay
            DailyEconomy.advance(&state)
            DailyEconomy.originalArmyReset(&state)
            MonthEnd.settle(&state)
        }
        return state
    }
}
