import Foundation

/// Float32 and Int32 arithmetic exactly as the web's native kernels (native-economy/numeric.ts): every
/// Math.fround is `fr`, every `| 0` wraps to Int32. Expressions below keep the TypeScript order.
enum Native {
    static func fr(_ x: Double) -> Double { Double(Float(x)) }
    static func i32(_ x: Int) -> Int { Int(Int32(truncatingIfNeeded: x)) }
    static func iadd(_ a: Int, _ b: Int) -> Int { i32(a + b) }
    static func imul(_ a: Int, _ b: Int) -> Int { Int(Int32(truncatingIfNeeded: a).multipliedReportingOverflow(by: Int32(truncatingIfNeeded: b)).partialValue) }
    static func idiv(_ a: Int, _ b: Int) -> Int { b == 0 ? 0 : i32(Int((Double(a) / Double(b)).rounded(.towardZero))) }
    /// Unity Mathf.RoundToInt: nearest, halfway to even (applied to the float32 value).
    static func roundInt(_ value: Double) -> Int {
        let x = fr(value), low = floor(x), part = x - low
        let r = part < 0.5 ? low : part > 0.5 ? low + 1 : (low.truncatingRemainder(dividingBy: 2) == 0 ? low : low + 1)
        return i32(Int(r))
    }
    static func clamp01(_ x: Double) -> Double { min(1, max(0, x)) }
}

/// The monthly treasury: Province.GetEcnomicPerMonth and State.UpdateEcnomic (native-economy/settlement.ts).
public enum Treasury {
    public struct Resource: Codable, Sendable, Equatable { public let base: Int; public let probability: Double; public let affectedBy: [String] }
    public struct ProvinceInput: Sendable {
        public var population: Int, capacity: Int, cells: Int, resources: [Resource], local: Double
        public init(population: Int, capacity: Int, cells: Int, resources: [Resource], local: Double) {
            self.population = population; self.capacity = capacity; self.cells = cells; self.resources = resources; self.local = local
        }
    }
    public static func provinceIncome(_ p: ProvinceInput, ethnic: String, destiny: Double, nationProvinces: Int, worldProvinces: Int) -> Int {
        let fr = Native.fr
        let base = Native.roundInt(fr(fr(Double(p.population)) * fr(0.001)))
        let utilization = Native.clamp01(fr(fr(Double(p.population)) / fr(Double(p.capacity))))
        var resources = 0
        for r in p.resources {
            var value = fr(fr(Double(r.base)) * fr(r.probability))
            if r.affectedBy.contains(ethnic) { value = fr(value * fr(1.2)) }
            resources = Native.iadd(resources, Native.roundInt(fr(fr(utilization * fr(0.5)) * value)))
        }
        let density = min(2, max(fr(0.5), fr(fr(fr(Double(p.population)) / fr(Double(p.cells))) / 100)))
        let resourceIncome = Native.roundInt(fr(fr(Double(resources)) * density))
        let destinyFactor = fr(1 - fr(fr(fr(100 - fr(destiny)) / 100) / 3))
        var income = Native.roundInt(fr(fr(Double(Native.iadd(base, resourceIncome))) * destinyFactor))
        let size = nationProvinces >= 10 ? fr(1 - fr(Native.clamp01(fr(fr(Double(nationProvinces)) / fr(Double(worldProvinces)))) * fr(0.5))) : 1
        income = Native.roundInt(fr(fr(Double(income)) * size))
        return Native.roundInt(fr(fr(Double(income)) * fr(p.local)))
    }

    /// nativeGoldBattleModifier: the treasury's battle factor by polity gold production and livelihood.
    public static func goldBattleModifier(gold: Int, production: Double, ethnic: String) -> Double {
        let factors: [String: (Double, Double)] = ["FishAndHunting": (1.02, 0.98), "Agriculture": (1.03, 0.97), "Nomadic": (1.01, 0.99),
                                                   "Maritime": (1.04, 0.96), "Commercial": (1.05, 0.95), "Other": (1, 1)]
        let fr = Native.fr, positive = gold > 0, pair = factors[ethnic] ?? (1, 1), ethnicFactor = positive ? pair.0 : pair.1
        return min(fr(1.2), max(fr(0.8), fr(fr(fr(production) * fr(positive ? 1.1 : 0.9)) * fr(ethnicFactor))))
    }

    public struct Settlement: Sendable, Equatable { public let gold: Int; public let goldPerMonth: Int; public let goldBattleModifier: Double }
    public static func settle(gold start: Int, incomes: [Int], tax: Double, central: Double, armyCost: Int, production: Double, ethnic: String) -> Settlement {
        let fr = Native.fr
        var sum = 0
        for x in incomes { sum = Native.iadd(sum, x) }
        let income = Native.roundInt(fr(fr(fr(Double(sum)) * fr(tax)) * fr(central)))
        let five = Native.imul(5, income), fifteen = Native.imul(15, income), twentyFive = Native.imul(25, income), ten = Native.imul(10, income)
        var factor = 1.0
        if start > five && start > 20000 {
            if start <= fifteen { factor = fr(1 + fr(Native.clamp01(fr(Double(Native.idiv(Native.iadd(start, -five), ten)))) * fr(-0.9))) }
            else if start <= twentyFive && start > 30000 { factor = fr(fr(0.1) + fr(Native.clamp01(fr(Double(Native.idiv(Native.iadd(start, -fifteen), ten)))) * fr(-0.05))) }
            else if start > twentyFive && start > 30000 { factor = fr(0.05) }
        }
        let credited = Native.roundInt(fr(fr(Double(income)) * factor))
        var gold = Native.iadd(start, credited)
        if gold < 0 && abs(fr(Double(gold))) > fr(Double(Native.imul(15, credited))) { gold = Native.imul(-15, credited) }
        let battle = goldBattleModifier(gold: gold, production: production, ethnic: ethnic)
        gold = Native.iadd(gold, -armyCost)
        return Settlement(gold: gold, goldPerMonth: credited, goldBattleModifier: battle)
    }
}

/// Destiny (国运): State.RandomDestiny and the monthly update (native-economy/destiny.ts with the web's
/// per-state LCG stream, destiny20-state.ts).
public enum Destiny {
    public struct State: Codable, Sendable, Equatable {
        public var destiny: Double, decrease: Double, manifestCount: Int, manifest: Bool, seed: UInt32, lastMonth: Int
    }
    struct Random {
        var seed: UInt32
        mutating func unit() -> Double { seed = seed &* 1664525 &+ 1013904223; return Double(seed) / 4294967296 }
        mutating func intRange(_ lo: Int, _ hi: Int) -> Int { lo + Int(floor(unit() * Double(hi - lo))) }
        mutating func floatRange(_ lo: Double, _ hi: Double) -> Double { let l = Native.fr(lo), h = Native.fr(hi); return Native.fr(Native.fr(l + (h - l) * unit())) }
    }
    static func threshold(_ manifestCount: Int) -> Double {
        let fr = Native.fr
        guard manifestCount > 0 else { return fr(10) }
        let product = fr(fr(Double(manifestCount)) * fr(1.5)), t = product.rounded(.towardZero)
        let converted = t < -2147483648 || t > 2147483647 ? -2147483648 : t
        return fr(fr(converted) + fr(10))
    }
    /// One month: decline by the decrease rate (faster with a full population and debt; the leader's
    /// administration slows it above 30), and a redraw once it falls below the threshold.
    @discardableResult
    public static func month(_ s: inout State, populationRatio: Double, gold: Int, leaderAdministrative: Double?) -> (reset: Bool, cleared: Bool) {
        let fr = Native.fr
        var random = Random(seed: s.seed)
        let ratio = fr(populationRatio), base = fr(s.decrease * fr(0.3333))
        let raw = fr(fr(base + fr(ratio * base)) + fr(base * (Double(gold) < 0 ? fr(0.5) : 0)))
        if s.destiny < fr(30) { s.destiny = fr(s.destiny - fr(random.floatRange(0.083, 0.24) * fr(0.5))) }
        else {
            let skill = leaderAdministrative.map { min(100, max(0, fr($0))) } ?? fr(50)
            let administrative = min(1, max(0, fr(skill / fr(100)))), factor = fr(fr(1.5) - administrative)
            s.destiny = fr(s.destiny - fr(factor * raw))
        }
        var reset = false, cleared = false
        if s.destiny < threshold(s.manifestCount) {
            reset = true
            s.manifestCount = random.intRange(2, 5)
            let manifest = s.manifest && s.manifestCount > 0
            s.manifestCount = Native.i32(s.manifestCount - 1)
            if manifest { s.destiny = Double(random.intRange(70, 90)) }
            else { s.destiny = Double(random.intRange(10, 90)); s.decrease = random.floatRange(0.043, 0.28); cleared = true }
        }
        s.seed = random.seed
        return (reset, cleared)
    }
}

/// Month-end inputs exported from the web world on day 0 (src/native-export/native-state.ts monthlyInputs).
public struct MonthlyStart: Codable, Sendable {
    public struct Province: Codable, Sendable, Equatable { public let province: Int; public let cells: Int; public let local: Double; public let resources: [Treasury.Resource] }
    public struct DestinyStart: Codable, Sendable { public let destiny: Double; public let decrease: Double; public let manifestCount: Int; public let manifest: Bool; public let seed: UInt32; public let lastMonth: Int }
    public let gold: Int; public let lastMonth: Int; public let ethnic: String; public let goldProduction: Double
    public let tax: Double; public let central: Double; public let fee: Int
    public let provinces: [Province]; public let destiny: DestinyStart; public let administrative: Double?
}

/// Per-nation month-end state in the Swift simulation. Court multipliers and the leader's administration
/// stay as on day 0 until the people and office modules are ported.
public struct NationTreasury: Sendable, Equatable {
    public var gold: Int, goldPerMonth: Int, goldBattleModifier: Double, lastMonth: Int
    public var destiny: Destiny.State
    public let ethnic: String, goldProduction: Double, tax: Double, central: Double, administrative: Double?
}
