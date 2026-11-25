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
    /// A column that has waited past its patience goes with what it has. A column too small for its
    /// target waits twice as long, but never for ever: two hosts facing each other across a border
    /// each found the other too strong and neither crossed (1.11.0), so a declared war was never fought.
    public static func muster(_ duties: [String: Duty], forces: [Force], attack: [Post], rally: [Int: Int], patience: Double = 15) -> [String: Duty] {
        var out = duties
        var columns = [Int: [Force]]()
        for f in forces {
            if let duty = duties[f.id], case .attack(let p) = duty { columns[p, default: []].append(f) }
        }
        for post in attack {
            guard let at = rally[post.province], let column = columns[post.province], column.count > 1 else { continue }
            var ready = 0.0, total = 0.0, waited = 0.0
            for f in column {
                total += f.troops
                let marching = !f.movable || (f.target == post.province && !f.pledged)
                let gathered = f.province == at && f.still
                if marching || gathered { ready += f.troops }
                if f.pledged { waited = max(waited, f.waited) }
            }
            // Too few for this target even all together: the column waits longer for reinforcements,
            // then goes in with what it has.
            let outmatched = total < 0.7 * post.need
            let overdue = waited > (outmatched ? patience * 2 : patience)
            if overdue || (!outmatched && ready >= 0.8 * min(post.need, total)) { continue }
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
        var assignedTroops = [Int: Double]()
        func track(_ post: Post, budget: inout Double, make: (Int) -> Duty) {
            let beforeCount = duties.count
            fill(post, budget: &budget, make: make)
            if duties.count > beforeCount {
                var sum = 0.0
                for f in forces where duties[f.id] == make(post.province) { sum += f.troops }
                assignedTroops[post.province] = sum
            }
        }
        for post in defend { fill(post, budget: &open) { .defend($0) } }
        var reserve = holdBudget
        for post in hold { fill(post, budget: &reserve) { .hold($0) } }
        for post in attack { track(post, budget: &open) { .attack($0) } }
        if !attack.isEmpty {
            for f in free where f.movable {
                // 多轴进攻防扎堆：优先补强尚未溢出（< 2× 需求）的最近进攻目标，避免多余兵力全挤在单一方向。
                var near = attack[0], bestScore = Double.infinity
                for post in attack {
                    let cur = assignedTroops[post.province] ?? 0
                    let overkill = cur >= post.need * 2.0 ? 1.0 : 0.0
                    let ratio = cur / max(1, post.need)
                    let d = distance(f, post)
                    let score = overkill * 1_000_000 + d * (1 + min(2.0, ratio * 0.35))
                    if score < bestScore { bestScore = score; near = post }
                }
                duties[f.id] = .attack(near.province)
                assignedTroops[near.province, default: 0] += f.troops
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
        let iq = UnitKinds.enabled ? Regimes.tacticalIQ(r, nation: nation) : nil
        let focusW = iq?.focusWeight ?? 1.0
        let blunder = iq?.blunderJitter ?? 0.0
        let blunderDayBucket = r.world.day.asInt / 10
        // 旧都落在敌方控制下时，由「收复失地」评估，不能列为我军安静驻防点。
        let capital = Rebellion.capitalProvince(r, nation).flatMap { c.provinceAt[$0] }.flatMap { owned.contains($0) ? $0 : nil }
        var invadedFoes = 0.0, homeTroops = 0.0
        for p in owned {
            let f = (c.presentAt[provinces[p].id.asString] ?? []).reduce(0.0) { s, x in
                x.status.asString != "retreating" && enemySet.contains(x.nationId.asString) ? s + x.troops.asNumber : s
            }
            invadedFoes += f
        }
        let capitalInvaded = capital.map { cp in
            (c.presentAt[provinces[cp].id.asString] ?? []).contains { $0.status.asString != "retreating" && enemySet.contains($0.nationId.asString) }
        } ?? false
        for v in c.forcesOf[nation] ?? [] {
            let inHome = v.province.map { $0.controller.asString == nation } ?? false
            if inHome { homeTroops += v.army.troops.asNumber }
        }
        let homeCrisis = capitalInvaded || (invadedFoes > 0 && invadedFoes > homeTroops * 0.8)
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
            forces.append(WarCouncil.Force(id: id, troops: a.troops.asNumber, x: at.x, y: at.y, feature: c.geo.cellFeature[v.cell], target: pledge ?? ordered, movable: (!inEnemyLand || homeCrisis) && !fighting,
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

        // 预读取当前围城进度：救危解围与乘胜追击共用
        var enemySiegeOnUs = [String: Double]()
        var ourSiegeOnEnemy = [String: Double]()
        if !r.occupation.isNull && !r.occupation.sieges.isNull {
            for sg in r.occupation.sieges.asArray {
                let maxR = max(1.0, sg.maximum.optionalNumber ?? 100.0)
                let rem = sg.resistance.optionalNumber ?? maxR
                let prog = max(0.0, min(1.0, 1.0 - rem / maxR))
                let pid = sg.provinceId.asString
                let ctrl = sg.controller.asString
                if ctrl == nation {
                    enemySiegeOnUs[pid] = max(enemySiegeOnUs[pid] ?? 0, prog)
                } else if enemySet.contains(ctrl) {
                    ourSiegeOnEnemy[pid] = max(ourSiegeOnEnemy[pid] ?? 0, prog)
                }
            }
        }

        // 守土: land an enemy stands on or has taken from us (都城 > 危城围困 > 重兵来犯).
        let invaded = owned.filter { foes($0) > 0 }
        let ranked = invaded.map { (p: $0, foes: foes($0), siege: enemySiegeOnUs[provinces[$0].id.asString] ?? 0) }.sorted { x, y in
            if (x.p == capital) != (y.p == capital) { return x.p == capital }
            let xUrgent = x.siege >= 0.35, yUrgent = y.siege >= 0.35
            if xUrgent != yUrgent { return xUrgent }
            if xUrgent && abs(x.siege - y.siege) > 0.1 { return x.siege > y.siege }
            return x.foes != y.foes ? x.foes > y.foes : x.p < y.p
        }
        var defend = ranked.map { item -> WarCouncil.Post in
            let mult = item.siege >= 0.6 ? 1.38 : 1.25
            return post(item.p, need: max(item.foes * mult, 1), mustHold: item.p == capital)
        }
        // 收复失地: a few coordinated columns in strength, starting with what is nearest the host.
        let columns = max(1, min(5, (forces.count + 2) / 3)), siege = max(2500, average * 1.5)
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
        let hasLandFront = !frontier.isEmpty
        // 跨海远征统筹（解决岛国大军滞留本土、或陆权大国不发兵攻打海外岛敌的问题）：
        // 凡无陆地接壤的海外敌国，只要本国拥有海港，直接将敌方海港与沿海登陆点纳入主力进攻纵队。
        let overseasEnemies = enemySet.subtracting(Set(frontier.keys)).sorted()
        var overseasSet = Set<String>()
        if !overseasEnemies.isEmpty, let sea = Naval.sea, !sea.ports.isEmpty {
            let portPidSet = Set(sea.ports.map(\.provinceId))
            let myPorts = sea.ports.filter { port in
                guard let idx = c.provinceAt[port.provinceId] else { return false }
                return RunWindow.access(r, nation, provinces[idx].controller.asString)
            }
            if !myPorts.isEmpty {
                let geo = c.geo
                for enemy in overseasEnemies {
                    let enemyProvs = provinces.indices.filter { provinces[$0].controller.asString == enemy }
                    let beachheads = enemyProvs.filter { portPidSet.contains(provinces[$0].id.asString) || geo.coasts.contains($0) }
                    let pool = beachheads.isEmpty ? enemyProvs : beachheads
                    let ranked = pool.sorted { a, b in
                        let pa = portPidSet.contains(provinces[a].id.asString) ? 0 : 1
                        let pb = portPidSet.contains(provinces[b].id.asString) ? 0 : 1
                        if pa != pb { return pa < pb }
                        let ca = center(a), cb = center(b)
                        let da = myPorts.reduce(Double.infinity) { min($0, jsHypot(ca.x - $1.center.x, ca.y - $1.center.y)) }
                        let db = myPorts.reduce(Double.infinity) { min($0, jsHypot(cb.x - $1.center.x, cb.y - $1.center.y)) }
                        return da != db ? da < db : a < b
                    }
                    let chosen = Array(ranked.prefix(6))
                    if !chosen.isEmpty {
                        frontier[enemy] = chosen
                        overseasSet.insert(enemy)
                    }
                }
            }
        }
        var committed = [String: Double]()
        for f in forces { if let t = f.target, enemySet.contains(provinces[t].controller.asString) { committed[provinces[t].controller.asString, default: 0] += f.troops } }
        var invaders = [String: Double]()
        for p in owned {
            for x in c.presentAt[provinces[p].id.asString] ?? [] where enemySet.contains(x.nationId.asString) && x.status.asString != "retreating" { invaders[x.nationId.asString, default: 0] += x.troops.asNumber }
        }
        var lostByEnemy = [String: Int]()
        for p in lost { lostByEnemy[provinces[p].controller.asString, default: 0] += 1 }
        var capitalThreatByEnemy = Set<String>()
        if let cp = capital {
            for q in provinces[cp].neighbors.asArray {
                if let qi = c.provinceAt[q.asString] {
                    let ctrl = provinces[qi].controller.asString
                    if enemySet.contains(ctrl) { capitalThreatByEnemy.insert(ctrl) }
                }
            }
        }
        func strength(_ n: String) -> Double { c.strength[n] ?? 0 }
        func standing(_ n: String) -> Double {
            let commitScore = committed[n] ?? 0
            let invadeScore = (invaders[n] ?? 0) * 1.65
            let lostScore = Double(lostByEnemy[n] ?? 0) * average * 0.55
            let capScore = capitalThreatByEnemy.contains(n) ? average * 1.25 : 0
            return commitScore + invadeScore + lostScore + capScore - strength(n) * 0.45
        }
        let order = frontier.keys.sorted { x, y in standing(x) != standing(y) ? standing(x) > standing(y) : x < y }

        // 分守: the borders we are not attacking across keep a holding force; a host too small to divide does not.
        var hold = [WarCouncil.Post]()
        // 京畿驻军 (app rule): 纯岛国海外出征时（无陆地战线），仅留 1 军守都（forces >= 4），释放大部兵力跨海远征！
        let needCapGuard = hasLandFront ? (forces.count >= 2) : (forces.count >= 4)
        if needCapGuard, let cp = capital, !invaded.contains(cp) {
            hold.append(post(cp, need: max(average, mine * (hasLandFront ? 0.12 : 0.08)), mustHold: true))
        }
        if forces.count >= 3 {
            let others = contact.keys.filter { $0 != order.first && !RunWindow.access(r, nation, $0) }.sorted { x, y in
                let wx = enemySet.contains(x), wy = enemySet.contains(y)
                if wx != wy { return wx }
                return strength(x) != strength(y) ? strength(x) > strength(y) : x < y
            }
            for other in others {
                let atWar = enemySet.contains(other), power = strength(other)
                if !atWar && power < mine * 0.2 { continue }
                let total = atWar ? power * 0.5 : min(power, mine) * 0.2
                // 驻防点有滞回：已有我军开赴的边境州只要仍与该国接壤就继续守，空位才按此刻对面兵力挑选。
                // 原先每次都按邻国军队眼下站在哪里重排，对面一走动驻防点就换，在路上的军队被改派回头、来回往返。
                let manned = Set(forces.compactMap(\.target))
                let posts = (contact[other] ?? [:]).sorted { x, y in
                    let mx = manned.contains(x.key), my = manned.contains(y.key)
                    if mx != my { return mx }
                    return x.value != y.value ? x.value > y.value : x.key < y.key
                }.prefix(atWar ? 2 : 1)
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
        // 取富庶之地 (app rule, at the player's request; the original FindRegularTargetProvince weighs
        // distance only): among targets about as near, the more populous one is taken first.
        // Each province's people are kept in the statecraft ledger (as the state page reads them).
        var people = [String: Double](), populace = 0.0
        for s in r.world.statecraft.provinces.asArray {
            let n = s.population.optionalNumber ?? 0
            people[s.provinceId.asString] = n; populace += n
        }
        let meanPopulation = max(1, populace / Double(max(1, people.count)))
        for (k, enemy) in order.enumerated() {
            let list = frontier[enemy] ?? []
            let bound = forces.filter { f in f.target.map { provinces[$0].controller.asString == enemy } ?? false }
            let host = bound.isEmpty ? forces : bound
            var weight = 0.0, sumX = 0.0, sumY = 0.0
            for f in host { weight += f.troops; sumX += f.x * f.troops; sumY += f.y * f.troops }
            let cx: Double = sumX / max(1, weight), cy: Double = sumY / max(1, weight)
            let enemyCapitalIdx = Rebellion.capitalProvince(r, enemy).flatMap { c.provinceAt[$0] }
            let heart = enemyCapitalIdx.map { center($0) }
            let targeted = Set(bound.compactMap(\.target))
            func value(_ p: Int) -> Double {
                let at = center(p)
                let pid = provinces[p].id.asString
                var v = jsHypot(at.x - cx, at.y - cy)
                if let heart { v += 0.7 * jsHypot(at.x - heart.x, at.y - heart.y) }
                // 直捣黄龙：可直取敌都时大幅提权（名将敏锐直扑敌心，昏君难察战机）
                if p == enemyCapitalIdx { v -= 140 * focusW }
                // 乘胜追击：我军已在围困该州时持续加压至破城
                if let prog = ourSiegeOnEnemy[pid], prog > 0.05 { v -= (85 + prog * 60) * focusW }
                // 避实击虚：优先突破敌军空虚防线
                if foes(p) <= 0 { v -= 55 * focusW }
                if targeted.contains(p) { v -= 60 * max(0.5, focusW) }
                if CombatReader.protruding(r, p) { v -= 35 * focusW }
                // 故土光复与突出部合围：名将擅长剪除敌军突出部与飞地，以少胜多
                if provinces[p].legalOwner.optionalString == nation { v -= 52 * max(0.7, focusW) }
                var ourAdj = 0, enemyAdj = 0
                for q in provinces[p].neighbors.asArray {
                    if let qi = c.provinceAt[q.asString] {
                        let ctrl = provinces[qi].controller.asString
                        if ctrl == nation { ourAdj += 1 }
                        else if ctrl == enemy { enemyAdj += 1 }
                    }
                }
                if ourAdj >= 2 && enemyAdj <= 1 { v -= 54 * focusW }
                if ourAdj >= 3 { v -= 28 * focusW }
                v -= 40 * min(2.5, (people[pid] ?? 0) / meanPopulation) * max(0.6, focusW)
                // 昏君/庸将战略误判偏移（确定性哈希，保证回放一致）：容易错失破绽、胡乱换靶或死磕坚城
                if blunder > 1 {
                    let h = Opening.hash("\(r.world.custom.seed.asString)|iq|\(nation)|\(blunderDayBucket)|\(p)")
                    v += (Double(h % 200) / 100.0 - 1.0) * blunder
                }
                return v
            }
            let sorted = list.map { (p: $0, v: value($0)) }.sorted { x, y in x.v != y.v ? x.v < y.v : x.p < y.p }
            let isOverseasFront = overseasSet.contains(enemy)
            let frontCols = isOverseasFront ? max(2, min(6, (forces.count + 1) / 2)) : (k == 0 ? columns : max(1, columns / 2))
            for item in sorted.prefix(frontCols) {
                // The enemy next door will come to its aid: half of them count.
                var nearby = 0.0
                for q in provinces[item.p].neighbors.asArray {
                    if let qi = c.provinceAt[q.asString], enemySet.contains(provinces[qi].controller.asString) { nearby += foes(qi) }
                }
                // 名将更重视集中优势兵力（避免添油战术），昏君常以偏师硬撞重兵
                let oddsScale = (iq?.tier ?? 0) >= 1 ? 1.55 : ((iq?.tier ?? 0) <= -1 ? 1.05 : 1.40)
                let baseNeed = max((foes(item.p) + nearby * 0.5) * (isOverseasFront ? 1.65 : oddsScale), isOverseasFront ? max(siege * 1.6, mine * 0.28) : siege)
                let need = baseNeed
                // A stronghold the whole host could not take is left for later (昏君容易盲目硬攻坚城).
                let skipLimit = (iq?.tier ?? 0) <= -2 ? 2.4 : 1.1
                if need > max(freeTroops, mine * 0.5) * skipLimit && !attack.isEmpty { continue }
                attack.append(post(item.p, need: need))
                if !isOverseasFront {
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
        }
        let holdBudget = hasLandFront ? (mine * ((iq?.tier ?? 0) >= 1 ? 0.32 : 0.38)) : (mine * 0.14)
        let duties = WarCouncil.assign(forces: forces, defend: defend, hold: hold, holdBudget: holdBudget, attack: attack)
        return WarCouncil.muster(duties, forces: forces, attack: attack, rally: rally, patience: iq?.musterPatience ?? 15)
    }
}
