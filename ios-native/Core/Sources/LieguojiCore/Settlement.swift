import Foundation

/// Peace settlement of an external war (native-war settlement-verdict / plan / classification /
/// execute and the reparations effect): who won, which provinces change hands, reparations, and each
/// participant's outcome. Province ownership and treasuries are written into the world.
public enum Settlement {
    public struct Transfer: Codable, Sendable, Equatable { public let sourceGoalId: Int; public let provinceId: Int; public let from: Int; public let to: Int; public let type: Int }
    public struct Effect: Codable, Sendable, Equatable { public let sourceGoalId: Int; public let type: Int; public let beneficiary: Int; public let target: Int; public var status: Int }
    public struct Result: Sendable, Equatable {
        public var victorSide: Int?
        public var winnerSide: Int?
        public var annexation: Bool
        public var enforcedGoals: [Int]
        public var transfers: [Transfer]
        public var applied: [Transfer]
        public var effects: [Effect]
        /// [stateId, outcome] (0 victory, 1 defeat, 2 peace) in participant order.
        public var outcomes: [[Int]]
    }

    struct Plan { var transfers: [Transfer] = []; var effects: [Effect] = []; var effectResults: [Effect] = []; var annexation = false }

    static let f = Native.fr
    static func sideIDs(_ w: PeaceWar, _ side: Int) -> Set<Int> { Set((w.participants + w.destroyedParticipants).filter { $0.side == side }.map(\.stateId)) }

    /// nativeWarDistress.
    static func distress(_ ai: PeaceAI, _ id: Int) -> Double {
        let side = ai.side(id); guard side != 2, let s = ai.byState[id] else { return 0 }
        let enemy = side == 0 ? 1 : 0
        return ai.clamp(f(f(ai.economyStress(s) * f(0.2)) + f(f(ai.strengthStress(side, enemy) * f(0.35)) + f(ai.casualtyStress(side, enemy) * f(0.45)))))
    }
    static func collapsedOrGone(_ ai: PeaceAI, _ id: Int) -> Bool {
        guard let s = ai.byState[id] else { return true }
        return s.dead || s.provinces.isEmpty || ai.collapsed(id)
    }
    /// PeaceResolverV2.DetermineVictorSide.
    static func victor(_ ai: PeaceAI, _ w: PeaceWar, _ reason: Int) -> Int? {
        let d = collapsedOrGone(ai, w.primaryDefenderId), a = collapsedOrGone(ai, w.primaryAttackerId)
        if a && d { return nil }; if a { return 1 }; if d { return 0 }
        if reason == 0 || reason == 9 { return 0 }
        let ad = distress(ai, w.primaryAttackerId), dd = distress(ai, w.primaryDefenderId)
        if dd >= f(0.45) && f(dd - ad) >= f(0.25) { return 0 }
        if ad >= f(0.45) && f(ad - dd) >= f(0.25) { return 1 }
        let score = ai.score().score
        if score >= 50 { return 0 }; if score <= -50 { return 1 }
        if reason == 4 {
            let territory = f(max(-1, min(1, f(ai.sideLoss(1) - ai.sideLoss(0)))) * 100)
            let goal = max(-1, min(1, f(ai.averageGoal(0) - ai.averageGoal(1))))
            if territory >= 10 && goal > 0 { return 0 }
            if territory <= -10 || territory <= 0 && f(ad - dd) >= f(0.1) { return 1 }
        }
        return nil
    }
    /// ShouldDecisiveAnnex.
    static func decisiveAnnex(_ ai: PeaceAI, _ w: PeaceWar, _ victor: Int?) -> Bool {
        guard victor == 0, let attacker = ai.byState[w.primaryAttackerId], let defender = ai.byState[w.primaryDefenderId], !defender.dead else { return false }
        let current = ai.countLand(defender); if current < 1 { return false }
        if w.goals.contains(where: { $0.type == 3 }) {
            let initial = ai.initialLand(w.primaryDefenderId)
            let capital = ai.capitals[w.primaryDefenderId].flatMap { ai.owner($0) }
            let held = capital.map { ai.side($0) == 0 } ?? false
            if initial > 0 && f(Double(current)) <= f(f(Double(initial)) * f(held ? 0.7 : 0.4)) { return true }
        }
        return current <= 1 && attacker.strength >= f(defender.strength * 3)
    }

    static func resolveGoalProvinces(_ ai: PeaceAI, _ g: PeaceWar.Goal) -> [Int] { g.type == 3 ? (ai.byState[g.target]?.provinces ?? []) : (g.provinceIds ?? []) }
    static func collectTransfers(_ ai: PeaceAI, _ p: inout Plan, _ g: PeaceWar.Goal, _ annex: Bool, _ defenders: Set<Int>) {
        for id in resolveGoalProvinces(ai, g) {
            if p.transfers.contains(where: { $0.provinceId == id }) { continue }
            guard let owner = ai.owner(id), owner != g.beneficiary else { continue }
            if g.type == 2 || !defenders.contains(owner) { continue }
            if !annex && ai.countLand(ai.byState[owner]) <= 1 { continue }
            p.transfers.append(Transfer(sourceGoalId: g.id, provinceId: id, from: owner, to: g.beneficiary, type: g.type))
        }
    }

    // MARK: classification

    static func netGain(_ ai: PeaceAI, _ p: Plan, _ id: Int, _ enemies: Set<Int>, _ pending: Bool) -> Int {
        var net = 0
        for (pid, initial) in ai.initialOwners {
            guard let owner = ai.owner(pid) else { continue }
            if enemies.contains(initial) && owner == id { net += 1 } else if initial == id && enemies.contains(owner) { net -= 1 }
        }
        if pending {
            for t in p.transfers {
                guard ai.owner(t.provinceId) != nil, let initial = ai.initialOwner(t.provinceId) else { continue }
                if t.to == id && enemies.contains(initial) { net += 1 } else if initial == id && enemies.contains(t.to) && ai.owner(t.provinceId) == id { net -= 1 }
            }
        }
        return net
    }
    static func lossFraction(_ ai: PeaceAI, _ id: Int) -> Double {
        let initial = ai.initialCounts[id] ?? 0; if initial <= 0 { return 0 }
        var lost = 0; for (pid, owner) in ai.initialOwners where owner == id && ai.owner(pid) != id { lost += 1 }
        return f(f(Double(lost)) / f(Double(initial)))
    }
    static func allGoalsFailed(_ ai: PeaceAI, _ w: PeaceWar) -> Bool {
        var any = false; for g in w.goals where PeaceAI.enforceable(g.type) { any = true; if ai.goalAchieved(g) { return false } }; return any
    }
    static func beneficiary(_ p: Plan, _ id: Int, _ pending: Bool) -> Bool { pending && p.transfers.contains { $0.to == id } }
    static func hasEffect(_ p: Plan, _ id: Int, target: Bool, _ actual: Bool) -> Bool {
        actual ? p.effectResults.contains { ($0.status == 0 || $0.status == 1) && (target ? $0.target : $0.beneficiary) == id } : p.effects.contains { (target ? $0.target : $0.beneficiary) == id }
    }
    static func classifyState(_ ai: PeaceAI, _ w: PeaceWar, _ p: Plan, _ part: PeaceWar.Participant, _ enemies: Set<Int>, _ pending: Bool, _ actual: Bool) -> Int {
        let id = part.stateId
        if collapsedOrGone(ai, id) { return 1 }
        if netGain(ai, p, id, enemies, pending) >= 1 { return 0 }
        if p.annexation && beneficiary(p, id, pending) { return 0 }
        if hasEffect(p, id, target: false, actual) { return 0 }
        if part.side == 1 && !hasEffect(p, id, target: true, actual) && allGoalsFailed(ai, w) && lossFraction(ai, id) <= 0 { return 0 }
        return 2
    }
    static func classify(_ ai: PeaceAI, _ w: PeaceWar, _ p: Plan, _ attackers: Set<Int>, _ defenders: Set<Int>, _ victor: Int?, _ pending: Bool, _ actual: Bool) -> (outcomes: [[Int]], winner: Int?) {
        let all = w.participants + w.destroyedParticipants
        var order = [Int](), out = [Int: Int]()
        for part in all { if out[part.stateId] == nil { order.append(part.stateId) }; out[part.stateId] = classifyState(ai, w, p, part, part.side == 0 ? defenders : attackers, pending, actual) }
        let list = { order.map { [$0, out[$0]!] } }
        if let victor {
            let loser = victor == 0 ? 1 : 0, loserPrimary = loser == 0 ? w.primaryAttackerId : w.primaryDefenderId, winnerPrimary = victor == 0 ? w.primaryAttackerId : w.primaryDefenderId
            let enemies = loser == 0 ? defenders : attackers
            var material = false
            for part in all where part.side == loser && out[part.stateId] == 0 {
                let id = part.stateId
                if netGain(ai, p, id, enemies, pending) >= 1 || beneficiary(p, id, pending) || hasEffect(p, id, target: false, actual) { if id == loserPrimary { material = true } }
                else { out[id] = 2 }
            }
            if out[winnerPrimary] == 0 || !actual && !material { return (list(), victor) }
        }
        var a = false, d = false
        for part in all where out[part.stateId] == 0 { if part.side == 0 { a = true } else if part.side == 1 { d = true } }
        return (list(), a == d ? nil : a ? 0 : 1)
    }

    /// settleWar47's plan and execution for reasons 0, 1, 2 and 4.
    public static func settle(war w: PeaceWar, world: inout PeaceWorld, reason: Int) -> Result? {
        if [6, 7, 8, 10, 11].contains(reason) || w.internal { return nil }
        var ai = PeaceAI(war: w, world: world)
        let attackers = sideIDs(w, 0), defenders = sideIDs(w, 1), victorSide = victor(ai, w, reason)
        var p = Plan()
        let decisive = decisiveAnnex(ai, w, victorSide) && reason != 4
        if decisive { p.annexation = true }
        var enforced = [Int]()
        for g in w.goals where PeaceAI.enforceable(g.type) {
            let achieved = ai.goalAchieved(g)
            let forced = !achieved && [0, 1, 4, 6, 11].contains(g.type) && victorSide != nil && ai.side(g.beneficiary) == victorSide
            if !achieved && !forced { continue }
            if [4, 6, 11].contains(g.type) {
                if !p.annexation { enforced.append(g.id); p.effects.append(Effect(sourceGoalId: g.id, type: g.type, beneficiary: g.beneficiary, target: g.target, status: 0)) }
            } else { enforced.append(g.id); collectTransfers(ai, &p, g, p.annexation, defenders) }
        }
        if decisive {
            for pid in ai.byState[w.primaryDefenderId]?.provinces ?? [] where !p.transfers.contains(where: { $0.provinceId == pid }) {
                p.transfers.append(Transfer(sourceGoalId: -1, provinceId: pid, from: w.primaryDefenderId, to: w.primaryAttackerId, type: 3))
            }
        }
        // ExecutePlan: provinces change hands, then the effects.
        var applied = [Transfer]()
        for t in p.transfers {
            guard world.provinceStates.indices.contains(t.provinceId - 1), let target = world.states.firstIndex(where: { $0.id == t.to }) else { continue }
            let old = world.provinceStates[t.provinceId - 1]
            world.provinceStates[t.provinceId - 1] = t.to
            if let o = world.states.firstIndex(where: { $0.id == old }) { world.states[o].provinces.removeAll { $0 == t.provinceId }; world.states[o].dead = world.states[o].provinces.isEmpty }
            if !world.states[target].provinces.contains(t.provinceId) { world.states[target].provinces.append(t.provinceId) }
            world.states[target].dead = false
            applied.append(t)
        }
        for e in p.effects {
            var r = e
            if e.type == 6, let b = world.states.firstIndex(where: { $0.id == e.beneficiary }), let t = world.states.firstIndex(where: { $0.id == e.target }), !world.states[t].dead {
                let half = max(0, nativeRoundToEven(f(f(world.states[t].gold) * 0.5)))
                let income = Double(max(1, Native.imul(max(0, Int(world.states[t].goldPerMonth)), 6)))
                let amount = max(half, income)
                world.states[t].gold = Double(Native.i32(Int(world.states[t].gold - amount)))
                world.states[b].gold = Double(Native.i32(Int(world.states[b].gold + amount)))
                r.status = 0
            } else { r.status = 2; enforced.removeAll { $0 == e.sourceGoalId } }
            p.effectResults.append(r)
        }
        ai = PeaceAI(war: w, world: world)
        let final = classify(ai, w, p, attackers, defenders, victorSide, false, true)
        return Result(victorSide: victorSide, winnerSide: final.winner, annexation: p.annexation, enforcedGoals: enforced, transfers: p.transfers, applied: applied, effects: p.effectResults, outcomes: final.outcomes)
    }
}
