import Foundation

/// 军机调度 (app worlds, not in the original): a state at war places its armies as one host instead of
/// each army choosing alone. Its land under attack is relieved first, with only as many troops as the
/// enemy there calls for; the borders it is not attacking across keep a holding force; the rest goes
/// forward against one main enemy, a few columns at a time, and keeps going forward from where it is.
/// Everything is read from the current world and the armies' standing orders, so replays agree.
public enum WarCouncil {
    public struct Force: Equatable {
        public let id: String; public let troops: Double; public let x: Double; public let y: Double; public let feature: Int
        /// The province this army is already ordered to.
        public let target: Int?
        /// False while it fights or besieges: it counts where it is bound, but is not called away.
        public let movable: Bool
        /// The province it stands in, and whether it stands still there.
        public let province: Int?
        public let still: Bool
        /// Its target is a post it is gathering for, not yet marching on; and for how many days.
        public let pledged: Bool
        public let waited: Double
        public init(id: String, troops: Double, x: Double, y: Double, feature: Int, target: Int?, movable: Bool,
                    province: Int? = nil, still: Bool = true, pledged: Bool = false, waited: Double = 0) {
            self.id = id; self.troops = troops; self.x = x; self.y = y; self.feature = feature; self.target = target; self.movable = movable
            self.province = province; self.still = still; self.pledged = pledged; self.waited = waited
        }
    }
    public struct Post: Equatable {
        public let province: Int; public let x: Double; public let y: Double; public let feature: Int; public let need: Double
        /// Filled however badly the odds stand (the capital).
        public let mustHold: Bool
        public init(province: Int, x: Double, y: Double, feature: Int, need: Double, mustHold: Bool = false) {
            self.province = province; self.x = x; self.y = y; self.feature = feature; self.need = need; self.mustHold = mustHold
        }
    }
    public enum Duty: Equatable {
        case defend(Int), hold(Int), attack(Int)
        /// 集结: wait at `at`, our own land beside the target `goal`, until the column is whole.
        case stage(at: Int, goal: Int)
        /// Where the army is to go now.
        public var province: Int {
            switch self {
            case .defend(let p), .hold(let p), .attack(let p): return p
            case .stage(let at, _): return at
            }
        }
        /// Worth turning an army around for on the march.
        public var urgent: Bool { switch self { case .attack, .stage: return false; case .defend, .hold: return true } }
        /// A refused relief can release a marching defender for another task. Ordinary attacks
        /// keep their route, so fresh plans do not repeatedly restart their progress.
        public func replaces(target: Int?, decision: String) -> Bool {
            guard target != province else { return false }
            return urgent || decision == "supporting" || decision == "guarding" || decision == "staging"
        }
    }

    /// 集结后出击: a target that takes several armies is not attacked one army at a time. Those sent
    /// against it gather first in our own land beside it and go in together, once most of what the
    /// target calls for stands ready or is already on its way in; whoever arrives later follows at once.
    /// A column that has waited past its patience goes with what it has, unless that is far too little.
    public static func muster(_ duties: [String: Duty], forces: [Force], attack: [Post], rally: [Int: Int], patience: Double = 40) -> [String: Duty] {
        var out = duties
        var columns = [Int: [Force]]()
        for f in forces {
            if let duty = duties[f.id], case .attack(let p) = duty { columns[p, default: []].append(f) }
        }
        for post in attack {
            guard let at = rally[post.province], let column = columns[post.province], column.count > 1 else { continue }
            var ready = 0.0, total = 0.0, overdue = false
            for f in column {
                total += f.troops
                let marching = !f.movable || (f.target == post.province && !f.pledged)
                let gathered = f.province == at && f.still
                if marching || gathered { ready += f.troops }
                if f.pledged && f.waited > patience { overdue = true }
            }
            // Too few for this target even all together: the column waits at the border however long,
            // rather than go in to be beaten (those already inside fight on).
            let outmatched = total < 0.7 * post.need
            if !outmatched && (overdue || ready >= 0.8 * min(post.need, total)) { continue }
            for f in column where f.movable && !(f.target == post.province && !f.pledged) {
                out[f.id] = .stage(at: at, goal: post.province)
            }
        }
        return out
    }

    static func distance(_ f: Force, _ p: Post) -> Double {
        let dx = f.x - p.x, dy = f.y - p.y
        let straight = (dx * dx + dy * dy).squareRoot()
        // Over water is a long way round, however close it looks.
        return f.feature == p.feature ? straight : straight * 3
    }

    /// Fills the posts in order: the armies already bound for a post count first (up to what it needs),
    /// then the nearest free armies. Whatever is left joins the nearest attack.
    public static func assign(forces: [Force], defend: [Post], hold: [Post], holdBudget: Double, attack: [Post]) -> [String: Duty] {
        var duties = [String: Duty]()
        var free = forces.sorted { $0.id < $1.id }

        func fill(_ post: Post, budget: inout Double, make: (Int) -> Duty) {
            // Decide whether this post can be relieved before committing any marching armies.
            // Counting them first left an outmatched column assigned even when this check refused
            // the relief. Armies already engaged at the post keep their orders; they cannot leave.
            let committed = free.filter { !$0.movable && $0.target == post.province }
            let reachable = free.reduce(0.0) { sum, f in
                sum + (f.movable || f.target == post.province ? f.troops : 0)
            }
            if !post.mustHold && reachable < post.need * 0.5 {
                for f in committed { duties[f.id] = make(post.province) }
                let engaged = Set(committed.map(\.id))
                free.removeAll { engaged.contains($0.id) }
                return
            }
            var have = 0.0
            var rest = [Force]()
            for f in free {
                if f.target == post.province && have < post.need { have += f.troops; duties[f.id] = make(post.province) }
                else { rest.append(f) }
            }
            free = rest
            while have < post.need && budget > 0 {
                var best = -1, bestDistance = Double.infinity
                for (i, f) in free.enumerated() where f.movable {
                    let d = distance(f, post)
                    if d < bestDistance { bestDistance = d; best = i }
                }
                if best < 0 { return }
                let f = free.remove(at: best)
                have += f.troops; budget -= f.troops
                duties[f.id] = make(post.province)
            }
        }

        var open = Double.infinity
        for post in defend { fill(post, budget: &open) { .defend($0) } }
        var reserve = holdBudget
        for post in hold { fill(post, budget: &reserve) { .hold($0) } }
        for post in attack { fill(post, budget: &open) { .attack($0) } }
        if !attack.isEmpty {
            for f in free where f.movable {
                var near = attack[0], nearest = distance(f, near)
                for post in attack.dropFirst() {
                    let d = distance(f, post)
                    if d < nearest { nearest = d; near = post }
                }
                duties[f.id] = .attack(near.province)
            }
        }
        return duties
    }
}

extension ArmyOrders {
    /// What one batch reads once and every state's plan shares.
    struct CouncilContext {
        let presentAt: [String: [JS]]
        let provinces: [JS]
        let provinceAt: [String: Int]
        let ownedBy: [String: [Int]]
        let geo: Geography
        let manual: Set<String>
        let held: Set<String>
        var forcesOf: [String: [Armies.Located]]
        var strength: [String: Double]
    }

    /// The whole state's orders for this moment.
    static func warPlan(_ r: JS, nation: String, enemies enemySet: Set<String>, _ c: CouncilContext, bridge: ForceBridge) -> [String: WarCouncil.Duty] {
        let g = bridge.graph, state = r.armyAutonomy, provinces = c.provinces
        let owned = c.ownedBy[nation] ?? []
        var forces = [WarCouncil.Force]()
        for v in c.forcesOf[nation] ?? [] {
            let a = v.army, id = a.id.asString
            if c.manual.contains(id) || a.status.asString == "retreating" || !r.reorganization.active[id].isNull { continue }
            let at = g.location(bridge.travel(v.travel)).point
            let inEnemyLand = v.province.map { enemySet.contains($0.controller.asString) } ?? false
            let fighting = c.held.contains(Daily.key("army", id)) || a.status.asString == "fighting"
            let row = state.armies[id]
            let pledge: Int? = row.pledge.optionalString.flatMap { c.provinceAt[$0] }
            let ordered: Int? = row.targetId.optionalString.flatMap { c.provinceAt[$0] }
            let waited: Double = row.pledgeTick.optionalNumber.map { (r.clock.tick.asNumber - $0) / 120 } ?? 0
            let standing: Int? = v.province.flatMap { c.provinceAt[$0.id.asString] }
            forces.append(WarCouncil.Force(id: id, troops: a.troops.asNumber, x: at.x, y: at.y, feature: c.geo.cellFeature[v.cell], target: pledge ?? ordered, movable: !inEnemyLand && !fighting,
                                           province: standing, still: v.travel.status.asString != "moving", pledged: pledge != nil, waited: waited))
        }
        guard !forces.isEmpty else { return [:] }
        let mine = forces.reduce(0.0) { $0 + $1.troops }, average = mine / Double(forces.count)

        func center(_ p: Int) -> (x: Double, y: Double) { (provinces[p].center.x.asNumber, provinces[p].center.y.asNumber) }
        func post(_ p: Int, need: Double, mustHold: Bool = false) -> WarCouncil.Post {
            let at = center(p)
            return WarCouncil.Post(province: p, x: at.x, y: at.y, feature: c.geo.provinceFeature[provinces[p].id.asString] ?? -1, need: need, mustHold: mustHold)
        }
        func foes(_ p: Int) -> Double {
            (c.presentAt[provinces[p].id.asString] ?? []).reduce(0.0) { sum, x in
                x.status.asString != "retreating" && enemySet.contains(x.nationId.asString) ? sum + x.troops.asNumber : sum
            }
        }

        // 守土: land an enemy stands on or has taken from us.
        let capital = Rebellion.capitalProvince(r, nation).flatMap { c.provinceAt[$0] }
        let invaded = owned.filter { foes($0) > 0 }
        let ranked = invaded.map { (p: $0, foes: foes($0)) }.sorted { x, y in
            if (x.p == capital) != (y.p == capital) { return x.p == capital }
            return x.foes != y.foes ? x.foes > y.foes : x.p < y.p
        }
        var defend = ranked.map { post($0.p, need: max($0.foes * 1.25, 1), mustHold: $0.p == capital) }
        // 收复失地: a column or two at a time, in strength, starting with what is nearest the host; one army
        // sent to each lost province only fed them to the enemy one by one.
        let columns = max(1, min(4, forces.count / 6)), siege = max(2500, average * 1.5)
        var hostX = 0.0, hostY = 0.0
        for f in forces { hostX += f.x * f.troops; hostY += f.y * f.troops }
        hostX /= max(1, mine); hostY /= max(1, mine)
        func away(_ p: Int) -> Double { let at = center(p); return jsHypot(at.x - hostX, at.y - hostY) }
        let lost = provinces.indices.filter { provinces[$0].legalOwner.optionalString == nation && enemySet.contains(provinces[$0].controller.asString) && !invaded.contains($0) }
        for p in lost.sorted(by: { away($0) != away($1) ? away($0) < away($1) : $0 < $1 }).prefix(columns) { defend.append(post(p, need: max(foes(p) * 1.5, siege))) }

        // Who touches us, and the provinces where they touch.
        var contact = [String: [Int: Double]]()
        for p in owned {
            for q in provinces[p].neighbors.asArray {
                guard let qi = c.provinceAt[q.asString] else { continue }
                let other = provinces[qi].controller.asString
                if other == nation { continue }
                let near = (c.presentAt[q.asString] ?? []).reduce(0.0) { $1.nationId.asString == other ? $0 + $1.troops.asNumber : $0 }
                contact[other, default: [:]][p, default: 0] += near
            }
        }

        // 主攻: the enemy to finish first. Armies already committed keep it from changing every week.
        var frontier = [String: [Int]]()
        for p in stateBorders(r, nation, enemySet) { frontier[provinces[p].controller.asString, default: []].append(p) }
        var committed = [String: Double]()
        for f in forces { if let t = f.target, enemySet.contains(provinces[t].controller.asString) { committed[provinces[t].controller.asString, default: 0] += f.troops } }
        var invaders = [String: Double]()
        for p in owned {
            for x in c.presentAt[provinces[p].id.asString] ?? [] where enemySet.contains(x.nationId.asString) && x.status.asString != "retreating" { invaders[x.nationId.asString, default: 0] += x.troops.asNumber }
        }
        func strength(_ n: String) -> Double { c.strength[n] ?? 0 }
        func standing(_ n: String) -> Double { (committed[n] ?? 0) + (invaders[n] ?? 0) - strength(n) * 0.5 }
        let order = frontier.keys.sorted { x, y in standing(x) != standing(y) ? standing(x) > standing(y) : x < y }

        // 分守: the borders we are not attacking across keep a holding force; a host too small to divide does not.
        var hold = [WarCouncil.Post]()
        if forces.count >= 6 {
            let others = contact.keys.filter { $0 != order.first && !RunWindow.access(r, nation, $0) }.sorted { x, y in
                let wx = enemySet.contains(x), wy = enemySet.contains(y)
                if wx != wy { return wx }
                return strength(x) != strength(y) ? strength(x) > strength(y) : x < y
            }
            for other in others {
                let atWar = enemySet.contains(other), power = strength(other)
                if !atWar && power < mine * 0.2 { continue }
                let total = atWar ? power * 0.5 : min(power, mine) * 0.2
                let posts = (contact[other] ?? [:]).sorted { x, y in x.value != y.value ? x.value > y.value : x.key < y.key }.prefix(atWar ? 2 : 1)
                for (p, _) in posts where !hold.contains(where: { $0.province == p }) && !invaded.contains(p) { hold.append(post(p, need: max(total / Double(posts.count), average * 0.6))) }
            }
        }

        // 进军: a few columns against the main enemy, each given what its target calls for; more enemies
        // open only when the first front is full. The next target is the one nearest where the host now
        // stands and on the road to the enemy's capital, never one chosen for being close to home.
        var attack = [WarCouncil.Post]()
        // 集结地: our own quiet province beside each target, the one nearest the host.
        var rally = [Int: Int]()
        let freeTroops = forces.reduce(0.0) { $0 + ($1.movable ? $1.troops : 0) }
        for (k, enemy) in order.enumerated() {
            let list = frontier[enemy] ?? []
            let bound = forces.filter { f in f.target.map { provinces[$0].controller.asString == enemy } ?? false }
            let host = bound.isEmpty ? forces : bound
            var weight = 0.0, sumX = 0.0, sumY = 0.0
            for f in host { weight += f.troops; sumX += f.x * f.troops; sumY += f.y * f.troops }
            let cx: Double = sumX / max(1, weight), cy: Double = sumY / max(1, weight)
            let heart = Rebellion.capitalProvince(r, enemy).flatMap { c.provinceAt[$0] }.map { center($0) }
            let targeted = Set(bound.compactMap(\.target))
            func value(_ p: Int) -> Double {
                let at = center(p)
                var v = jsHypot(at.x - cx, at.y - cy)
                if let heart { v += 0.7 * jsHypot(at.x - heart.x, at.y - heart.y) }
                if targeted.contains(p) { v -= 60 }
                if CombatReader.protruding(r, p) { v -= 30 }
                return v
            }
            let sorted = list.map { (p: $0, v: value($0)) }.sorted { x, y in x.v != y.v ? x.v < y.v : x.p < y.p }
            for item in sorted.prefix(k == 0 ? columns : max(1, columns / 2)) {
                // The enemy next door will come to its aid: half of them count.
                var nearby = 0.0
                for q in provinces[item.p].neighbors.asArray {
                    if let qi = c.provinceAt[q.asString], enemySet.contains(provinces[qi].controller.asString) { nearby += foes(qi) }
                }
                let need = max((foes(item.p) + nearby * 0.5) * 1.4, siege)
                // A stronghold the whole host could not take is left for later.
                if need > max(freeTroops, mine * 0.5) * 1.1 && !attack.isEmpty { continue }
                attack.append(post(item.p, need: need))
                var best = -1, bestDistance = Double.infinity
                for q in provinces[item.p].neighbors.asArray {
                    guard let qi = c.provinceAt[q.asString], provinces[qi].controller.asString == nation, foes(qi) == 0 else { continue }
                    let at = center(qi)
                    let d: Double = jsHypot(at.x - cx, at.y - cy)
                    if d < bestDistance || (d == bestDistance && qi < best) { bestDistance = d; best = qi }
                }
                if best >= 0 { rally[item.p] = best }
            }
        }
        let duties = WarCouncil.assign(forces: forces, defend: defend, hold: hold, holdBudget: mine * 0.35, attack: attack)
        return WarCouncil.muster(duties, forces: forces, attack: attack, rally: rally)
    }
}
