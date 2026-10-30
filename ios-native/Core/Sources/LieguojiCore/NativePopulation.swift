import Foundation

/// Port of src/fms/play/native-economy/population.ts. This is INITIALIZATION,
/// not a daily growth rule. Keep Float intermediates and truncation order.
public enum NativePopulation {
    public static let capacity: [Float] = [5,0.5,0.5,4,6,8,10,6,6,4,3,0.5,5]
    public struct Input: Codable, Sendable {
        public var biomes: [Int]
        public var perCellFactor: Int32
        public var growthRate: Float
        public var statePercentage: Float
        public var provinceRandom: Float
        public var atWar: Bool
        public var oldPopulation: Int32
        public var oldMaximum: Int32
        public var maximumLocked: Bool
        public init(biomes: [Int], perCellFactor: Int32, growthRate: Float, statePercentage: Float, provinceRandom: Float, atWar: Bool = false, oldPopulation: Int32 = 0, oldMaximum: Int32 = 0, maximumLocked: Bool = false) {
            self.biomes = biomes; self.perCellFactor = perCellFactor; self.growthRate = growthRate
            self.statePercentage = statePercentage; self.provinceRandom = provinceRandom; self.atWar = atWar
            self.oldPopulation = oldPopulation; self.oldMaximum = oldMaximum; self.maximumLocked = maximumLocked
        }
    }
    public struct Result: Codable, Equatable, Sendable {
        public let population: Int32
        public let maximum: Int32
    }
    public enum Failure: Error { case invalidInput, integerOverflow }
    private static func integer(_ value: Float) throws -> Int32 {
        guard value.isFinite, Double(value.rounded(.towardZero)) >= Double(Int32.min), Double(value.rounded(.towardZero)) <= Double(Int32.max) else { throw Failure.integerOverflow }
        return Int32(value)
    }
    public static func initialize(_ input: Input) throws -> Result {
        guard input.perCellFactor >= 0, [input.growthRate,input.statePercentage,input.provinceRandom].allSatisfy({ $0.isFinite && $0 >= 0 }), input.biomes.allSatisfy({capacity.indices.contains($0)}) else { throw Failure.invalidInput }
        var sum: Float = 0
        for biome in input.biomes { sum += capacity[biome] }
        let computed = max(1,try integer(Float(input.perCellFactor)*sum+5000))
        let maximum = input.maximumLocked && input.oldMaximum > 0 ? input.oldMaximum : computed
        let hadData = input.oldMaximum > 0 || input.oldPopulation > 0
        var population = hadData ? min(maximum,max(0,input.oldPopulation)) : try integer((Float(maximum)*input.statePercentage)*input.provinceRandom)
        let growth: Float = input.atWar ? input.growthRate*0.97 : input.growthRate
        population = try integer(Float(population)*growth)
        let minimum: Float = Float(maximum)*0.3
        if population > maximum { population = maximum }
        else if minimum > Float(population) { population = try integer(minimum) }
        return Result(population: population,maximum: maximum)
    }
}
