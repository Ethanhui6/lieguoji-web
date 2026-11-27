import Foundation

extension DeclarationEngine {
    public enum AllianceAction: Equatable { case join(alliance: Int), create(target: Int), destroy(alliance: Int) }
    /// native-war/alliance nativeUpdateAlliance on the typed diplomacy world: join an acceptable
    /// alliance, found one with a suitable neighbour, or (a superpower) dissolve its own. Spends 100
    /// power on success; random picks use the world's diplomacy stream.
    public func allianceDecision(_ w: inout DiplomacyWorld, nation: Int, enabled: Bool, sinceAction: Int, sinceJoin: Int?, age: Int?) -> AllianceAction? {
        let f = Native.fr
        guard w.nations[nation].pools.power > 100, sinceAction >= 3 else { return nil }
        var c = Context(engine: self, world: w)
        defer { w = c.w }
        let a = nation, current = c.states[a].alliance
        func finish(_ action: AllianceAction) -> AllianceAction { c.w.nations[nation].pools.power = f(c.w.nations[nation].pools.power - 100); return action }
        func isAtWar(_ s: Int) -> Bool { !c.enemies(s).isEmpty }
        func members(_ alliance: Int) -> [Int] { c.w.alliances[alliance].members }
        func randomIndex(_ count: Int) -> Int { Int((c.w.random() * Double(count)).rounded(.down)) }
        if enabled && current == nil && !c.superPower(a) {
            if !isAtWar(a) {
                var acceptable = [Int]()
                for (k, v) in c.w.alliances.enumerated() where !v.ended {
                    let m = v.members
                    guard m.count > 1, m.contains(where: { !c.states[$0].dead }) else { continue }
                    var ok = true
                    for n in m { if !(c.affinity(n, a) >= 0) || isAtWar(n) { ok = false; break } }
                    if ok && m.contains(where: { c.states[$0].neighbors.contains(c.states[a].id) }) { acceptable.append(k) }
                }
                if !acceptable.isEmpty { return finish(.join(alliance: acceptable[randomIndex(acceptable.count)])) }
            }
            var targets = [Int]()
            if !c.states[a].dead {
                for b in c.states.indices where b != a {
                    let s = c.states[b]
                    guard !s.dead, s.id != 0, !s.vassal, s.alliance == nil, !c.atWar(a, b), c.states[a].neighbors.contains(s.id) || c.states[a].seaNeighbors.contains(s.id), !c.superPower(b),
                          c.strength(a) <= f(c.strength(b) * 3), c.strength(b) <= f(c.strength(a) * 3) else { continue }
                    if c.affinity(a, b) > 5 { targets.append(b) }
                }
            }
            if !targets.isEmpty { return finish(.create(target: targets[randomIndex(targets.count)])) }
        }
        if let current, c.superPower(a), (sinceJoin ?? 0) >= 7, (age ?? 0) >= 10 {
            let m = members(current), outsiders = c.states.indices.filter { c.states[$0].id != 0 && !c.states[$0].dead && c.states[$0].alliance != current }
            func strength(_ list: [Int]) -> Double { f(list.reduce(0.0) { $0 + c.strength($1) }) }
            var affinity = 0.0
            for n in m where n != a { affinity = f(affinity + c.affinity(a, n)) }
            if f(strength(m) * 0.5) > strength(outsiders) || affinity < 0 { return finish(.destroy(alliance: current)) }
        }
        return nil
    }
}

extension DiplomacyBridge {
    /// evaluateAlliance47 on the run state.
    @discardableResult
    public static func evaluateAlliance(_ r: JS, _ nationId: String, engine: DeclarationEngine) -> String? {
        // v11.0.0 历史剧本「史实路线」先拦截再算外交力：全面禁止 AI 自主新建/乱拉/解散同盟（杜绝“德瑞联盟”且不白扣 100 外交力）
        if UnitKinds.enabled && HistoricalEvents.isHistoricalRoute(r) { return nil }
        guard r.diplomacy.worldAuto.isTruthy, r.diplomacy.nations[nationId].optionalBool == true, Vassals.overlord(r, nationId) == nil,
              let i = r.world.nations.asArray.firstIndex(where: { $0.id.asString == nationId }) else { return nil }
        if !Vassals.alive(r, nationId) { return nil }
        func years(_ t: JS) -> Int { People.yearSince(r, t.isNull ? r.alliances.originTime.asNumber : t.asNumber) }
        let current = Vassals.allianceOf(r, nationId)
        var w = world(r)
        let known = w.relations.count
        let action = engine.allianceDecision(&w, nation: i, enabled: r.alliances.enabled.isTruthy, sinceAction: years(r.alliances.lastAction[nationId]),
                                             sinceJoin: current.map { years($0.joinedTime) }, age: current.map { years($0.startedTime) })
        mirrorRelations(r, w, from: known)
        let s = r.nativeDiplomacy
        s.rng = JS(Double(w.rng)); s.draws = JS(w.draws); s.nations[nationId].pools.power = JS(w.nations[i].pools.power)
        guard let action else { return nil }
        // v8.0.0 历史剧本「史实路线」严格锁盟保护：AI 不可随意解散、退出或跨阵营背刺历史同盟（轴心/同盟/抗日统一战线等）
        if UnitKinds.enabled && HistoricalEvents.isHistoricalRoute(r) {
            switch action {
            case .destroy(let k):
                let recs = r.alliances.records.asArray
                if recs.indices.contains(k), recs[k].unbreakable.isTruthy {
                    return nil
                }
            case .join, .create:
                // 史实路线下已属锁定历史阵营的国家不得随意改换门庭，新阵营加入交由历史事件链按史实触发
                if let cur = current, cur.unbreakable.isTruthy {
                    return nil
                }
            }
        }
        let records = r.alliances.records.asArray, now = JS(f(r.life.gameTime.asNumber))
        let result: String
        switch action {
        case .join(let k):
            let v = records[k]
            v.members.push(JS(nationId)); v.joinedTime = now.clone(); Vassals.bump(r.alliances)
            People.announce(r, kind: "diplomacy", text: "\(Vassals.name(r, nationId))加入\(v.name.asString)", reason: "今后的外部战争按当前盟约决定参战；不补入既有战争。", nations: v.members.asArray.map(\.asString), province: nil)
            r.alliances.lastAction[nationId] = now.clone(); result = "join"
        case .create(let b):
            let target = r.world.nations[b].id.asString, id = r.alliances.nextId.asNumber
            r.alliances.nextId = JS(id + 1)
            let v = JS.object()
            v.id = JS(id); v.name = JS("\(Vassals.name(r, nationId))-\(Vassals.name(r, target))联盟"); v.founders = .array([JS(nationId), JS(target)]); v.members = .array([JS(nationId), JS(target)])
            v.startedTime = now.clone(); v.joinedTime = JS(-100); v.startedTick = r.clock.tick.clone(); v.endedTick = .null; v.unbreakable = JS(false)
            r.alliances.records.push(v); Vassals.bump(r.alliances)
            People.announce(r, kind: "diplomacy", text: "\(Vassals.name(r, nationId))与\(Vassals.name(r, target))结成联盟", reason: "双方将在今后的宣战中共同参战；联盟不转移领土。", nations: [nationId, target], province: nil)
            r.alliances.lastAction[nationId] = now.clone(); result = "create"
        case .destroy(let k):
            _ = Vassals.dissolve(r, records[k], actor: nationId); result = "destroy"
        }
        Vassals.bump(r.alliances); Vassals.bump(s)
        return result
    }
}

/// v8.0.0 历史同盟快捷查询与锁盟保护入口（封装 Vassals 底层记录）。
public enum Alliances {
    public static func areAllies(_ r: JS, _ a: String, _ b: String) -> Bool {
        guard a != b, let al = Vassals.allianceOf(r, a) else { return false }
        return al.members.asArray.contains { $0.asString == b }
    }

    public static func isLockedHistorical(_ r: JS, _ nationId: String) -> Bool {
        guard HistoricalEvents.isHistoricalRoute(r), let al = Vassals.allianceOf(r, nationId) else { return false }
        return al.unbreakable.isTruthy
    }

    @discardableResult
    public static func leave(_ r: JS, _ nationId: String, force: Bool = false) -> (ok: Bool, reason: String) {
        guard let al = Vassals.allianceOf(r, nationId) else {
            return (false, "当前未加入任何同盟")
        }
        if !force && al.unbreakable.isTruthy && HistoricalEvents.isHistoricalRoute(r) {
            return (false, "史实路线下【\(al.name.asString)】为锁定历史阵营，不可随意退盟")
        }
        let ok = Vassals.leaveAlliance(r, nationId, force: force)
        return ok ? (true, "已退出【\(al.name.asString)】") : (false, "当前无法退出该同盟")
    }
}
