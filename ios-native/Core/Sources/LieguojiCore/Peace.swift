import Foundation

/// The peace AI of a war (native-war score / weariness / achievement / peace): war score from
/// occupation, battles and goals; each side's war weariness; collapse and goal achievement; and the
/// peace reason WarAIV2.DecidePeaceReason returns.
public struct PeaceWar: Codable, Sendable {
    public struct Participant: Codable, Sendable { public let stateId: Int; public let side: Int }
    public struct Goal: Codable, Sendable { public let type: Int; public let addedBy: Int; public let target: Int; public let beneficiary: Int; public let provinceIds: [Int]?; public let requiredCount: Int; public let hasScope: Bool }
    public let id: Int; public let `internal`: Bool; public let legacyWarType: Int
    public let primaryAttackerId: Int; public let primaryDefenderId: Int; public let startTime: Double
    public let participants: [Participant]; public let destroyedParticipants: [Participant]; public let goals: [Goal]
    public let initialOwners: [[Int]]; public let initialProvinceCounts: [[Int]]; public let initialCapitals: [[Int]]
    public let kills: [[Double]]; public let deaths: [[Double]]
}

public struct PeaceWorld: Codable, Sendable {
    public struct State: Codable, Sendable {
        public let id: Int; public let dead: Bool; public let provinces: [Int]
        public let gold: Double; public let goldPerMonth: Double; public let armyCostGold: Double
        public let strength: Double; public let lossThreshold: Double; public let autonomous: Bool
    }
    public let gameTime: Double; public let secondsPerDay: Double; public let start: DiplomacyWorld.Start
    /// State number of each province's controller (province numbers are index + 1).
    public let provinceStates: [Int]
    public let states: [State]
}

public struct PeaceAI {
    public struct Score: Codable, Sendable, Equatable { public let occupation: Double; public let battle: Double; public let goal: Double; public let score: Double }
    let w: PeaceWar
    let world: PeaceWorld
    let initialOwners: [(Int, Int)]
    let initialCounts: [Int: Int]
    let capitals: [Int: Int]
    let kills: [Int: Double], deaths: [Int: Double]
    let byState: [Int: PeaceWorld.State]

    public init(war: PeaceWar, world: PeaceWorld) {
        w = war; self.world = world
        // JavaScript Map semantics: first insertion order, last value wins.
        var owners = [(Int, Int)](), at = [Int: Int]()
        for p in war.initialOwners { if let i = at[p[0]] { owners[i].1 = p[1] } else { at[p[0]] = owners.count; owners.append((p[0], p[1])) } }
        initialOwners = owners
        var counts = [Int: Int](); for p in war.initialProvinceCounts { counts[p[0]] = p[1] }; initialCounts = counts
        var caps = [Int: Int](); for p in war.initialCapitals { caps[p[0]] = p[1] }; capitals = caps
        var k = [Int: Double](), d = [Int: Double]()
        for p in war.kills { k[Int(p[0])] = p[1] }
        for p in war.deaths { d[Int(p[0])] = p[1] }
        kills = k; deaths = d
        var s = [Int: PeaceWorld.State](); for st in world.states where s[st.id] == nil { s[st.id] = st }; byState = s
    }

    let f = Native.fr
    func clamp(_ v: Double, _ lo: Double = 0, _ hi: Double = 1) -> Double { v < lo ? lo : v > hi ? hi : v }
    var both: [PeaceWar.Participant] { w.participants + w.destroyedParticipants }
    /// The province's controller (all web provinces are land).
    func owner(_ id: Int) -> Int? { world.provinceStates.indices.contains(id - 1) ? world.provinceStates[id - 1] : nil }
    func countLand(_ s: PeaceWorld.State?) -> Int { s?.provinces.count ?? 0 }
    func initialLand(_ id: Int) -> Int { initialOwners.reduce(0) { $0 + ($1.1 == id && owner($1.0) != nil ? 1 : 0) } }
    func currentCount(_ id: Int) -> Int { guard let s = byState[id], !s.dead else { return 0 }; return s.provinces.count }
    func enemyStates(_ g: PeaceWar.Goal) -> Set<Int> {
        var ids = Set(w.participants.filter { $0.side == 1 }.map(\.stateId))
        if ids.isEmpty { ids.insert(w.primaryDefenderId) }
        if g.target > 0 { ids.insert(g.target) }
        return ids
    }
    func initialOwner(_ pid: Int) -> Int? { initialOwners.first { $0.0 == pid }?.1 }
    func effectiveRange(_ g: PeaceWar.Goal, _ enemies: Set<Int>) -> [Int] {
        let source = [3, 4, 11].contains(g.type) ? initialOwners.filter { $0.1 == g.target }.map(\.0) : (g.provinceIds ?? [])
        return source.filter { id in initialOwner(id).map { enemies.contains($0) } ?? false && owner(id) != nil }
    }
    func goalProgress(_ g: PeaceWar.Goal) -> Double {
        if w.internal { return internalProgress(g) }
        let enemies = enemyStates(g), range = effectiveRange(g, enemies)
        if range.isEmpty { return 1 }
        var achieved = 0
        for id in range { if let o = owner(id), enemies.contains(o) { continue }; achieved += 1 }
        var numerator = achieved, denominator = range.count
        if g.type == 2 || g.type == 6 { denominator = Int(clamp(Double(g.requiredCount), 1, Double(range.count))); numerator = min(achieved, denominator) }
        return clamp(f(f(Double(numerator)) / f(Double(denominator))))
    }
    func internalProgress(_ g: PeaceWar.Goal) -> Double {
        if g.type == 7 {
            let target = byState[g.target]; if target == nil || target!.dead || countLand(target) <= 0 { return 1 }
            let b = byState[g.beneficiary]; if b == nil || b!.dead || countLand(b) <= 0 { return 0 }
            let initial = initialLand(g.beneficiary); if initial <= 0 { return 0 }
            let threshold = max(1, Int(f(f(Double(initial)) * 0.5).rounded(.up)))
            return clamp(f(f(Double(countLand(b))) / f(Double(threshold))))
        }
        if g.type >= 8 && g.type <= 10 {
            let target = byState[g.target]; if target == nil || target!.dead || countLand(target) <= 0 { return 1 }
            let initial = initialLand(g.target); if initial <= 0 { return 0 }
            return clamp(f(f(Double(initial - countLand(target))) / f(Double(initial))))
        }
        return 0
    }
    func sideLoss(_ side: Int) -> Double {
        var initial = 0, current = 0
        for p in both where p.side == side { initial += initialCounts[p.stateId] ?? 0; current += currentCount(p.stateId) }
        return initial <= 0 ? 0 : clamp(f(f(Double(initial - current)) / f(Double(initial))))
    }
    func sideKills(_ side: Int) -> Double { var s = 0.0; for p in both where p.side == side { s = f(s + (kills[p.stateId] ?? 0)) }; return s }
    func averageGoal(_ side: Int) -> Double {
        let ids = Set(both.filter { $0.side == side }.map(\.stateId))
        var sum = 0.0, count = 0
        for g in w.goals where (g.type >= 0 && g.type <= 4 || g.type >= 6 && g.type <= 11) && ids.contains(g.addedBy) { sum = f(sum + goalProgress(g)); count += 1 }
        return count <= 0 ? 0 : f(sum / f(Double(count)))
    }
    public func score() -> Score {
        let occupation = clamp(f(sideLoss(1) - sideLoss(0)), -1, 1)
        let ak = sideKills(0), dk = sideKills(1), sum = f(dk + ak)
        let battle = sum <= f(0.0001) ? 0 : clamp(f(f(ak - dk) / sum), -1, 1)
        let goal = clamp(f(averageGoal(0) - averageGoal(1)), -1, 1)
        var combined = f(f(battle * f(0.2)) + f(occupation * 0.5)); combined = f(combined + f(goal * f(0.3)))
        return Score(occupation: occupation, battle: battle, goal: goal, score: f(clamp(combined, -1, 1) * 100))
    }

    // MARK: weariness

    func side(_ id: Int) -> Int { w.participants.first { $0.stateId == id }?.side ?? 2 }
    func sideDeaths(_ side: Int) -> Double { var t = 0.0; for p in both where p.side == side { t = f(t + (deaths[p.stateId] ?? 0)) }; return t }
    func sideStrength(_ side: Int) -> Double { var t = 0.0; for p in w.participants where p.side == side { if let s = byState[p.stateId] { t = f(t + s.strength) } }; return t }
    func casualtyStress(_ side: Int, _ enemy: Int) -> Double {
        let own = sideDeaths(side), other = sideDeaths(enemy), total = f(other + own)
        if total <= 0 { return 0 }
        let disadvantage = clamp(f(f(f(own / total) - 0.5) * 3)), magnitude = clamp(f(total / 2000))
        return f(magnitude * disadvantage)
    }
    func strengthStress(_ side: Int, _ enemy: Int) -> Double {
        let own = sideStrength(side), other = sideStrength(enemy), total = f(other + own)
        if total <= 0 { return 0 }
        let difference = f(0.5 - f(own / total)); return clamp(f(difference + difference))
    }
    func economyStress(_ s: PeaceWorld.State) -> Double {
        let income = f(s.goldPerMonth), expense = f(s.armyCostGold)
        let burn = income > 0 ? clamp(f(f(expense - income) / income)) : expense > 0 ? 1 : 0
        let treasury = clamp(f(1 - f(f(s.gold) / f(max(1, income) * 6))))
        return clamp(f(f(treasury * 0.5) + f(burn * 0.5)))
    }
    func gainedProvinces(_ id: Int) -> Int {
        let side = self.side(id); if side == 2 { return 0 }
        let enemies = Set(both.filter { $0.side != side && $0.side != 2 }.map(\.stateId))
        var net = 0
        for (pid, initial) in initialOwners {
            guard let current = owner(pid) else { continue }
            if enemies.contains(initial) && current == id { net += 1 } else if initial == id && enemies.contains(current) { net -= 1 }
        }
        return net
    }
    var decisiveIntent: Bool { w.goals.contains { $0.type == 3 || $0.type == 4 || $0.type == 11 } }
    func capitalPressure(_ id: Int) -> Double {
        guard let pid = capitals[id], let o = owner(pid) else { return 0 }
        let s = side(id), os = side(o)
        return s != 2 && os != 2 && s != os ? f(0.15) : 0
    }
    public func months() -> Int {
        let start = (world.start.year, world.start.month, world.start.day)
        return DiplomacyCalendar.wholeMonths(DiplomacyCalendar.date(w.startTime, secondsPerDay: world.secondsPerDay, start: start),
                                             DiplomacyCalendar.date(Native.fr(world.gameTime), secondsPerDay: world.secondsPerDay, start: start))
    }
    func wearinessFloor() -> Double { clamp(f(f(Double(months() - 60)) / 60)) }
    public func weariness(_ id: Int) -> Double {
        let side = self.side(id); guard side != 2, let s = byState[id] else { return 0 }
        let enemy = side == 0 ? 1 : 0
        let casualty = casualtyStress(side, enemy), strength = strengthStress(side, enemy), territory = clamp(f(f(Double(gainedProvinces(id))) / 3)), economy = economyStress(s)
        var subtotal = f(f(casualty * f(0.35)) + f(strength * 0.25)); subtotal = f(subtotal + f(territory * 0.25))
        var base = f(f(economy * f(0.15)) + subtotal)
        if decisiveIntent { base = f(base * f(0.6)) }
        return clamp(max(wearinessFloor(), f(capitalPressure(id) + base)))
    }
    public func forceSettleThreshold() -> Double { f(f(clamp(max(weariness(w.primaryAttackerId), weariness(w.primaryDefenderId))) * -35) + 75) }

    // MARK: achievement and the decision

    public func collapsed(_ id: Int) -> Bool {
        let initial = initialCounts[id] ?? 0; if initial <= 0 { return false }
        let raw = byState[id].map { $0.lossThreshold }
        let threshold = raw == nil ? 0.5 : raw! < f(0.3) ? f(0.3) : raw! > f(0.8) ? f(0.8) : raw!
        return f(f(Double(initial - currentCount(id))) / f(Double(initial))) > threshold
    }
    func goalAchieved(_ g: PeaceWar.Goal) -> Bool {
        if g.type != 2 && g.type != 6 { return goalProgress(g) >= 1 }
        let enemies = enemyStates(g), range = effectiveRange(g, enemies)
        var achieved = 0; for id in range { if let o = owner(id), enemies.contains(o) { continue }; achieved += 1 }
        return achieved >= max(1, min(max(1, range.count), g.requiredCount))
    }
    static func enforceable(_ t: Int) -> Bool { t >= 0 && t <= 4 || t >= 6 && t <= 11 }
    public func allGoalsAchieved() -> Bool {
        var any = false
        for g in w.goals where PeaceAI.enforceable(g.type) { any = true; if !goalAchieved(g) { return false } }
        return any
    }
    func deadOrZero(_ id: Int) -> Bool { guard let s = byState[id] else { return true }; return s.dead || countLand(s) <= 0 }
    public func hasAutonomousParticipant() -> Bool { w.participants.contains { p in byState[p.stateId].map { !$0.dead && $0.autonomous } ?? false } }

    /// nativeDecidePeaceReason for external wars: 0 goals achieved, 2 collapse, 1 decisive score, 4 weariness.
    public func decide() -> Int? {
        if w.internal { return nil }
        if months() >= 12 && allGoalsAchieved() { return 0 }
        if collapsed(w.primaryDefenderId) || collapsed(w.primaryAttackerId) { return 2 }
        if months() < 36 { return nil }
        let s = score().score
        if abs(s) >= forceSettleThreshold() { return 1 }
        if s <= -50 || s >= 50 { return 1 }
        if weariness(w.primaryAttackerId) >= 0.5 || weariness(w.primaryDefenderId) >= 0.5 { return 4 }
        return nil
    }
}
