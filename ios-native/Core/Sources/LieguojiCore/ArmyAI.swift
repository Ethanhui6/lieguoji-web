import Foundation

/// Static inputs of the army autonomy (src/native-export/army-ai-state.ts armyAiStatic), by world
/// province index.
public struct ArmyAIStatic: Codable, Sendable {
    public struct Province: Codable, Sendable {
        public let neighbors: [Int]; public let x: Double; public let y: Double
        public let coast: Bool; public let feature: Int; public let port: Bool
        /// Owner province of each outside border cell on the displayed map (province-border54).
        public let border: [Int]
    }
    public let seed: String
    public let originalPaths: Bool
    public let provinces: [Province]
    /// Travel feature (same-surface connected component) of every travel cell, by cell index.
    public let cellFeatures: [Int]
    public let capitals: [Int]
}

/// Dynamic inputs at a frame boundary (armyAiSnapshot).
public struct ArmyAIWorld: Codable, Sendable, Equatable {
    public struct Participant: Codable, Sendable, Equatable { public let nation: Int; public let side: Int }
    public struct Campaign: Codable, Sendable, Equatable { public var id: Int; public var ended: Bool; public var `internal`: Bool; public var participants: [Participant] }
    public struct Point: Codable, Sendable, Equatable { public let x: Double; public let y: Double }
    public struct Travel: Codable, Sendable, Equatable {
        public let version: Int; public let origin: Point; public let destination: Point?
        public let nodes: [Int]; public let leg: Int; public let offset: Double; public let crossed: Bool; public let status: String
    }
    public struct Row: Codable, Sendable, Equatable {
        public var target: Int; public var garrison: Int; public var campaign: Int; public var decision: String; public var nextTick: Int; public var issuedTick: Int
        public init(target: Int = -1, garrison: Int = -1, campaign: Int = -1, decision: String = "waiting", nextTick: Int = 0, issuedTick: Int = -1) {
            self.target = target; self.garrison = garrison; self.campaign = campaign; self.decision = decision; self.nextTick = nextTick; self.issuedTick = issuedTick
        }
    }
    public struct Army: Codable, Sendable, Equatable {
        public var id: String; public var nation: Int; public var troops: Int; public var status: String
        public var home: Int; public var anchor: Int; public var manual: Bool; public var busy: Bool; public var engaged: Bool
        public var travel: Travel; public var row: Row
    }
    public var tick: Int
    public var day: Int
    public var cursor: Int
    public var owners: [Int]
    public var wars: [[Int]]
    public var campaigns: [Campaign]
    public var alliances: [[Int]]
    public var vassals: [[Int]]
    public var armies: [Army]
}

extension ArmyTravel {
    /// From a web travel record (cell ids → graph indices).
    public init?(record t: ArmyAIWorld.Travel, graph g: TravelGraph) {
        guard t.version == 1 else { return nil }
        let nodes = t.nodes.compactMap { g.cell(id: $0) }
        guard nodes.count == t.nodes.count else { return nil }
        self.init(origin: TravelPoint(x: t.origin.x, y: t.origin.y), nodes: nodes)
        leg = t.leg; offset = t.offset; crossed = t.crossed
        status = ["moving": .moving, "arrived": .arrived, "blocked": .blocked, "halted": .halted][t.status] ?? .arrived
    }
    public var statusText: String { ["moving", "arrived", "blocked", "halted"][status.rawValue] }
}

/// The army autonomy (civilization47-army-ai issueArmySelection47 with the original-army rules: no
/// ration gate, no resting or staging), its five-call batch rotation (army-batch47) and the shared
/// command checks (army-commands47 resolve / issueArmyOrderOwned47).
public struct ArmyAutonomy: Sendable {
    public let statics: ArmyAIStatic
    public let graph: TravelGraph
    public init(statics: ArmyAIStatic, graph: TravelGraph) { self.statics = statics; self.graph = graph }

    struct Located { let army: Int; let point: TravelPoint; let cell: Int; let province: Int?; let travel: ArmyTravel }

    /// garrisonRandom47: FNV-1a seed, then the browser PRNG step.
    static func garrisonRandom(_ seed: String) -> () -> Double {
        var h: UInt32 = 2166136261
        for c in seed.utf16 { h = (h ^ UInt32(c)) &* 16777619 }
        return {
            h = h &+ 0x6d2b79f5
            var t = (h ^ (h >> 15)) &* (h | 1)
            t ^= t &+ ((t ^ (t >> 7)) &* (t | 61))
            return Double(t ^ (t >> 14)) / 4294967296
        }
    }

    /// One frame's batch: five calls from the cursor over the living armies.
    public func issueBatch(_ w: inout ArmyAIWorld, travels: inout [ArmyTravel]) {
        let live = w.armies.indices.filter { w.armies[$0].troops > 0 }
        guard !live.isEmpty else { return }
        var cursor = w.cursor, selected = [Int]()
        for _ in 0..<5 { if cursor >= live.count { cursor = 0 }; selected.append(live[cursor]); cursor += 1 }
        w.cursor = cursor
        var c = Context(engine: self, w: w, travels: travels)
        c.run(selected)
        w = c.w; travels = c.travels
    }

    struct Context {
        let engine: ArmyAutonomy
        var w: ArmyAIWorld
        var travels: [ArmyTravel]
        var g: TravelGraph { engine.graph }
        var s: ArmyAIStatic { engine.statics }

        func atWar(_ a: Int, _ b: Int) -> Bool { a != b && w.wars.contains { $0[0] == a && $0[1] == b || $0[0] == b && $0[1] == a } }
        func access(_ a: Int, _ b: Int) -> Bool {
            a == b || !atWar(a, b) && (w.alliances.contains { $0.contains(a) && $0.contains(b) } || w.vassals.contains { $0[0] == a && $0[1] == b })
        }
        func alive(_ i: Int) -> Bool { w.armies[i].troops > 0 && w.armies[i].status != "destroyed" }
        func locate(_ i: Int) -> Located {
            let at = g.location(travels[i]), q = Int(g.provinces[at.cell])
            return Located(army: i, point: at.point, cell: at.cell, province: q >= 0 ? q : nil, travel: travels[i])
        }
        /// readArmySpace47: armies by land province, in world order.
        func space() -> (byArmy: [Int: Located], land: [Int: [Int]]) {
            var by = [Int: Located](), land = [Int: [Int]]()
            for i in w.armies.indices where alive(i) { let l = locate(i); by[i] = l; if let p = l.province { land[p, default: []].append(i) } }
            return (by, land)
        }
        /// regularCampaigns47: enemy nation → campaign id, in campaign order.
        func enemies(_ nation: Int) -> [(nation: Int, campaign: Int)] {
            var out = [(nation: Int, campaign: Int)]()
            for c in w.campaigns where !c.ended && !c.internal {
                guard let p = c.participants.first(where: { $0.nation == nation }) else { continue }
                for e in c.participants where e.side != p.side && atWar(nation, e.nation) && !out.contains(where: { $0.nation == e.nation }) { out.append((e.nation, c.id)) }
            }
            return out
        }
        func protruding(_ p: Int) -> Bool {
            let border = s.provinces[p].border
            var foreign = 0
            for q in border where q >= 0 && w.owners[q] != w.owners[p] { foreign += 1 }
            return Native.fr(Native.fr(Double(foreign)) / Native.fr(Double(border.count))) > 0.5
        }
        /// stateBorderReader55: enemy provinces touching the state's border, in contact order.
        func stateBorders(_ nation: Int, _ regular: Set<Int>) -> [Int] {
            var out = [Int](), seen = Set<Int>()
            for p in w.owners.indices where w.owners[p] == nation {
                var unique = [Int](), u = Set<Int>()
                for q in s.provinces[p].border where q >= 0 && u.insert(q).inserted { unique.append(q) }
                for q in unique where w.owners[q] != nation && regular.contains(w.owners[q]) && seen.insert(q).inserted { out.append(q) }
            }
            return out
        }

        // MARK: commands (army-commands47)

        enum Action { case halt; case move(province: Int, retreat: Bool) }
        func engaged(_ i: Int) -> Bool { w.armies[i].status == "fighting" || w.armies[i].engaged }
        func safeRetreatEnd(_ l: Located, land: [Int: [Int]]) -> Bool {
            guard let p = l.province, !engaged(l.army), access(w.armies[l.army].nation, w.owners[p]) else { return false }
            return !(land[p] ?? []).contains { w.armies[$0].status != "retreating" && atWar(w.armies[l.army].nation, w.armies[$0].nation) }
        }
        /// resolve(): the travel an order would produce, or nil when it is refused.
        func resolve(_ i: Int, _ action: Action) -> ArmyTravel? {
            guard alive(i) else { return nil }
            let sp = space(), here = sp.byArmy[i]!, a = w.armies[i], t = travels[i]
            if engaged(i) { return nil }
            let enemiesHere = here.province.map { p in (sp.land[p] ?? []).contains { w.armies[$0].status != "retreating" && atWar(a.nation, w.armies[$0].nation) } } ?? false
            let hostile = here.province.map { atWar(a.nation, w.owners[$0]) } ?? false
            var retreat = false
            if case .move(_, let r) = action { retreat = r }
            if (hostile || enemiesHere) && !retreat { return nil }
            if a.status == "retreating", case .move = action, !retreat, !safeRetreatEnd(here, land: sp.land) { return nil }
            switch action {
            case .halt:
                if t.status == .arrived || t.status == .halted { return nil }
                var h = t; h.status = .halted; return h
            case .move(let province, let r):
                guard let target = g.targetCell(province: province) else { return nil }
                if target == t.nodes.last && t.status == .moving { return nil }
                let anchor = engine.statics.originalPaths && a.anchor >= 0 ? w.owners[a.anchor] : nil
                guard let path = g.path(from: here.cell, to: target, canEnterProvince: { q in
                    let c = w.owners[q]; return access(a.nation, c) || c == anchor || !r && atWar(a.nation, c)
                }) else { return nil }
                return ArmyTravel(origin: here.point, nodes: path.nodes)
            }
        }
        /// issueArmyOrderOwned47 (autonomous source).
        mutating func issue(_ i: Int, _ action: Action) -> Bool {
            if w.armies[i].manual { return false }
            guard let travel = resolve(i, action) else { return false }
            travels[i] = travel
            w.armies[i].travel = record(travel)
            var retreat = w.armies[i].status == "retreating"
            if case .move(_, let r) = action { retreat = r }
            let sp = space()
            w.armies[i].status = retreat && (!(travel.status == .arrived || travel.status == .halted) || !safeRetreatEnd(sp.byArmy[i]!, land: sp.land)) ? "retreating" : "idle"
            return true
        }
        func record(_ t: ArmyTravel) -> ArmyAIWorld.Travel {
            .init(version: 1, origin: .init(x: t.origin.x, y: t.origin.y), destination: nil, nodes: t.nodes.map { Int(g.ids[$0]) }, leg: t.leg, offset: t.offset, crossed: t.crossed, status: t.statusText)
        }
        mutating func halt(_ i: Int) { if resolve(i, .halt) != nil { _ = issue(i, .halt) } }

        // MARK: target choice

        struct Target { let id: Int; let x: Double; let y: Double; let feature: Int; let protruding: Bool; let port: Bool }
        static func score(_ current: TravelPoint, _ home: (Double, Double), _ feature: Int, _ p: Target) -> Double {
            let f = Native.fr
            let x = f(f(current.x) - f(p.x)), y = f(f(current.y) - f(p.y)), d = f(f(f(x * x) + f(y * y)).squareRoot())
            var weighted = p.protruding ? f(d + d) : f(d * 3)
            if feature != p.feature { weighted = f(weighted * 10) }
            let hx = f(f(home.0) - f(p.x)), hy = f(f(home.1) - f(p.y)), back = f(f(f(hy * hy) + f(hx * hx)).squareRoot())
            return f(back + weighted)
        }
        static func regularTarget(_ current: TravelPoint, _ home: (Double, Double), _ feature: Int, _ list: [Target]) -> Target? {
            let max = 3.4028234663852886e38
            var same: Target?, port: Target?, cross: Target?, sameScore = max, portScore = max, crossScore = max
            for p in list {
                let v = score(current, home, feature, p)
                if feature == p.feature { if v < sameScore { sameScore = v; same = p } }
                else { if p.port && v < portScore { portScore = v; port = p }; if v < crossScore { crossScore = v; cross = p } }
            }
            return same ?? port ?? cross
        }

        mutating func chooseIdle(_ i: Int, owned: [Int]) -> Int? {
            let a = w.armies[i], f = Native.fr
            let cp = s.capitals.indices.contains(a.nation) ? s.capitals[a.nation] : -1
            var area = Set<Int>()
            if cp >= 0 && w.owners[cp] == a.nation { area.insert(cp); for q in s.provinces[cp].neighbors where w.owners[q] == a.nation { area.insert(q) } }
            var priority = [(Int, Double)](), secondary = [(Int, Double)]()
            func weight(_ p: Int) -> Double { s.provinces[p].coast ? 0.5 : 2 }
            func targeting(_ p: Int) -> Int { w.armies.filter { $0.troops > 0 && $0.row.garrison == p }.count }
            for p in owned {
                let ns = s.provinces[p].neighbors
                let border = s.provinces[p].coast || ns.contains { w.owners[$0] != a.nation }
                if !border || area.contains(p) { continue }
                let ally = ns.contains { w.owners[$0] != a.nation && access(a.nation, w.owners[$0]) }
                if targeting(p) >= (ally ? 1 : 4) { continue }
                let foreign = ns.contains { w.owners[$0] != a.nation }
                if foreign { priority.append((p, ally ? f(0.2) : weight(p))) } else { secondary.append((p, ally ? f(0.2) : weight(p))) }
            }
            for p in owned where area.contains(p) && targeting(p) < 4 { priority.append((p, weight(p))) }
            let random = ArmyAutonomy.garrisonRandom("\(s.seed)/\(a.id)/\(w.day)/garrison47")
            let list = !priority.isEmpty && !secondary.isEmpty ? (f(random()) < f(0.18) ? secondary : priority) : !priority.isEmpty ? priority : secondary
            if list.isEmpty {
                if owned.contains(a.home) { return a.home }
                return owned.isEmpty ? nil : owned[min(owned.count - 1, Int((random() * Double(owned.count)).rounded(.down)))]
            }
            var total = 0.0; for p in list { total = f(total + p.1) }
            if total <= 0 { return list[min(list.count - 1, Int((random() * Double(list.count)).rounded(.down)))].0 }
            let draw = f(f(random()) * total)
            var sum = 0.0
            for p in list { sum = f(sum + p.1); if sum >= draw { return p.0 } }
            return list.last!.0
        }

        // MARK: the decision loop

        mutating func run(_ selected: [Int]) {
            let tick = w.tick, retry = 20
            let sp = space()
            let enemyMaps = (0..<(w.armies.map(\.nation).max() ?? -1) + 1).map { enemies($0) }
            for i in selected {
                var row = w.armies[i].row
                defer { w.armies[i].row = row }
                let a = w.armies[i], en = a.nation < enemyMaps.count ? enemyMaps[a.nation] : []
                let enemySet = Set(en.map(\.nation))
                func note(_ d: String, clear: Bool = false) { row.decision = d; row.nextTick = tick + retry; if clear { row.target = -1; row.campaign = -1; row.issuedTick = -1 } }
                if !en.isEmpty || row.garrison >= 0 && w.owners[row.garrison] != a.nation { row.garrison = -1 }
                guard let here = sp.byArmy[i] else { row.garrison = -1; note("lost", clear: true); continue }
                if a.manual { row.garrison = -1; note("manual", clear: true); continue }
                if a.busy || a.status == "fighting" { note("busy"); continue }
                if tick < row.nextTick { continue }
                func enemyAt(_ p: Int) -> Int? { (sp.land[p] ?? []).first { w.armies[$0].status != "retreating" && enemySet.contains(w.armies[$0].nation) }.map { w.armies[$0].nation } }
                let target = row.target >= 0 ? row.target : nil
                let targetEnemy: Int? = target.flatMap { t in enemySet.contains(w.owners[t]) ? w.owners[t] : access(a.nation, w.owners[t]) ? enemyAt(t) : nil }
                let ongoing = here.travel.status == .moving
                let targetOwned = target.map { w.owners[$0] == a.nation } ?? false
                if ongoing && (target == nil || targetEnemy != nil || row.decision == "returning" && targetOwned || row.decision == "staging" && targetOwned && !en.isEmpty
                               || row.garrison >= 0 && row.garrison == target && targetOwned && en.isEmpty || a.status == "retreating") {
                    if row.garrison >= 0 && row.garrison == target && targetOwned && en.isEmpty { note("garrison") } else { row.nextTick = tick + retry }
                    continue
                }
                if a.status != "retreating", let p = here.province, atWar(a.nation, w.owners[p]) { note("busy"); continue }
                var attack = [Int](), attackSet = Set<Int>()
                func add(_ p: Int) { if attackSet.insert(p).inserted { attack.append(p) } }
                let owned = w.owners.indices.filter { w.owners[$0] == a.nation }, invaded = owned.filter { enemyAt($0) != nil }
                if a.status != "retreating" && !en.isEmpty {
                    for p in invaded { add(p) }
                    for p in stateBorders(a.nation, enemySet) { add(p) }
                    if invaded.isEmpty {
                        for p in w.owners.indices where w.owners[p] != a.nation && access(a.nation, w.owners[p]) {
                            if enemyAt(p) != nil { add(p) }
                            for q in s.provinces[p].neighbors where enemySet.contains(w.owners[q]) { add(q) }
                        }
                    }
                    for p in w.owners.indices where enemySet.contains(w.owners[p]) && s.provinces[p].coast { add(p) }
                }
                let location = g.location(here.travel), home = (s.provinces[a.home].x, s.provinces[a.home].y)
                var candidates = attack.map { Target(id: $0, x: s.provinces[$0].x, y: s.provinces[$0].y, feature: s.provinces[$0].feature, protruding: protruding($0), port: s.provinces[$0].port) }
                var chosen: Int?
                while !candidates.isEmpty {
                    guard let p = Context.regularTarget(location.point, home, s.cellFeatures[location.cell], candidates) else { break }
                    if issue(i, .move(province: p.id, retreat: false)) { chosen = p.id; break }
                    candidates.removeAll { $0.id == p.id }
                }
                if let p = chosen {
                    let enemy = enemySet.contains(w.owners[p]) ? w.owners[p] : enemyAt(p)!
                    row.target = p; row.campaign = en.first { $0.nation == enemy }?.campaign ?? -1; row.issuedTick = tick
                    note(w.owners[p] == a.nation || access(a.nation, w.owners[p]) ? "supporting" : "attacking")
                    continue
                }
                if en.isEmpty, let hp = here.province, w.owners[hp] == a.nation {
                    var id: Int? = row.garrison >= 0 ? row.garrison : nil
                    if id == nil { w.armies[i].row = row; id = chooseIdle(i, owned: owned) }
                    if let id {
                        row.garrison = id
                        if hp == id {
                            if ongoing { halt(i) }
                            row.target = id; row.campaign = -1; if row.issuedTick < 0 { row.issuedTick = tick }
                            note("garrison"); continue
                        }
                        if issue(i, .move(province: id, retreat: false)) { row.target = id; row.campaign = -1; row.issuedTick = tick; note("garrison"); continue }
                    }
                }
                if let hp = here.province, w.owners[hp] == a.nation { if ongoing { halt(i) }; note(attack.isEmpty ? "waiting" : "no-route", clear: true); continue }
                let homes = owned.enumerated().sorted { x, y in
                    let dx = jsHypot(s.provinces[x.element].x - here.point.x, s.provinces[x.element].y - here.point.y)
                    let dy = jsHypot(s.provinces[y.element].x - here.point.x, s.provinces[y.element].y - here.point.y)
                    return dx != dy ? dx < dy : x.offset < y.offset
                }.map(\.element)
                var returning = false
                for p in homes where issue(i, .move(province: p, retreat: true)) {
                    row.target = p; row.campaign = -1; row.issuedTick = tick; note("returning"); returning = true; break
                }
                if !returning {
                    if ongoing && (here.province == nil || !atWar(a.nation, w.owners[here.province!])) { halt(i) }
                    note("no-route", clear: true)
                }
            }
        }
    }
}

public struct ArmyAIStart: Codable, Sendable { public let statics: ArmyAIStatic; public let world: ArmyAIWorld }

/// The army autonomy inside the Swift simulation.
public struct ArmyAIState: Sendable, Equatable {
    public var world: ArmyAIWorld
    let engine: ArmyAutonomy
    public static func == (a: ArmyAIState, b: ArmyAIState) -> Bool { a.world == b.world }
    public init(start: ArmyAIStart, graph: TravelGraph) { world = start.world; engine = ArmyAutonomy(statics: start.statics, graph: graph) }
    public var originalPaths: Bool { engine.statics.originalPaths }
}
