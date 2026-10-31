import SwiftUI
import LieguojiCore

/// Drives the Swift simulation actor from the play controls and publishes its state to the panels.
/// Speeds follow the web (1倍速 ≈ 10 days a second, 2 / 4 倍速 proportionally faster). The engine runs
/// off the main thread; the UI only reads the published snapshot.
@MainActor final class SimulationModel: ObservableObject {
    @Published private(set) var state: SimState
    @Published private(set) var playing = false
    @Published var speed = 1
    private let simulation: Simulation
    private var loop: Task<Void, Never>?

    private let map: WorldMap
    init(map: WorldMap, graph: TravelGraph?) {
        self.map = map
        let motion = graph.map { ArmyMotion(graph: $0, start: map.meta.travel) }
        let diplomacy = DiplomacyState(start: map.meta.diplomacy, names: map.meta.nations.map(\.name))
        let armyAI = graph.map { ArmyAIState(start: map.meta.armyAi, graph: $0) }
        simulation = Simulation(start: map.meta.economy, monthly: map.meta.monthly, worldProvinces: map.meta.provinces.count, motion: motion, diplomacy: diplomacy, armyAI: armyAI)
        state = SimState(start: map.meta.economy, monthly: map.meta.monthly, worldProvinces: map.meta.provinces.count, motion: motion, diplomacy: diplomacy, armyAI: armyAI)
    }

    // MARK: army orders

    /// A player march (army-commands47): returns the error text, or nil once the order stands.
    func march(army: Int, to province: Int) async -> String? {
        let (next, error) = await simulation.order(army: army, toProvince: province)
        state = next
        return error?.message
    }
    func halt(army: Int) async { state = await simulation.halt(army: army) }

    // MARK: diplomacy

    func declare(attacker: Int, defender: Int) async -> String? { let (next, e) = await simulation.declare(attacker: attacker, defender: defender); state = next; return e }
    func makePeace(_ a: Int, _ b: Int) async -> String? { let (next, e) = await simulation.makePeace(a, b); state = next; return e }

    /// Army icons: the exported idle spot until an army first moves, then its exact travel point.
    func armySprites(selected: Int?) -> [MapRenderer.ArmySprite] {
        let start = map.meta.economy.armies
        return state.armies.indices.compactMap { i in
            let a = state.armies[i]; guard a.troops > 0, start.indices.contains(i) else { return nil }
            var x = start[i].x, y = start[i].y
            if let m = state.motion, m.moved[i] { let p = m.mapPoint(i); x = Float(p.x); y = Float(p.y) }
            return MapRenderer.ArmySprite(army: i, x: x, y: y, unit: start[i].unit, nation: a.nation, selected: i == selected)
        }
    }
    func route(army: Int?) -> [SIMD2<Float>] {
        guard let army, let m = state.motion, m.travels.indices.contains(army) else { return [] }
        return m.route(army).map { SIMD2(Float($0.x), Float($0.y)) }
    }

    func togglePlay() { playing ? pause() : play() }
    func play() {
        guard loop == nil else { return }
        playing = true
        loop = Task { [weak self] in
            while !Task.isCancelled {
                guard let self else { return }
                let started = Date()
                let next = await self.simulation.advance(days: 1)
                self.state = next
                // Days per second: 10 × speed; a slow device simply runs a little slower.
                let budget = 0.1 / Double(max(1, self.speed))
                let rest = budget - Date().timeIntervalSince(started)
                if rest > 0 { try? await Task.sleep(nanoseconds: UInt64(rest * 1_000_000_000)) } else { await Task.yield() }
            }
        }
    }
    func pause() { loop?.cancel(); loop = nil; playing = false }
    func step() {
        guard !playing else { return }
        Task { state = await simulation.advance(days: 1) }
    }
    func cycleSpeed() { speed = speed == 1 ? 2 : speed == 2 ? 4 : 1 }

    // MARK: reading the state

    func province(_ index: Int) -> SimState.Province? { state.provinces.first { $0.province == index } }
    func totals(nation: Int) -> (population: Int, grain: Int, provinces: Int) {
        state.provinces.reduce((0, 0, 0)) { r, p in p.nation == nation ? (r.0 + p.population, r.1 + p.grain, r.2 + 1) : r }
    }
    func treasury(nation: Int) -> NationTreasury? { state.treasuries.indices.contains(nation) ? state.treasuries[nation] : nil }
    func armies(nation: Int) -> (count: Int, troops: Int) {
        state.armies.reduce((0, 0)) { r, a in a.nation == nation && a.troops > 0 ? (r.0 + 1, r.1 + a.troops) : r }
    }
}

extension Int {
    /// 1,234,567 → "123.5 万" style grouping the web uses for large numbers.
    var wan: String { self >= 10_000 ? String(format: "%.1f 万", Double(self) / 10_000) : "\(self)" }
}
