import Foundation

/// Calendar diplomacy on the run state (civilization47-diplomatic-state / civilization47-declaration):
/// the monthly schedule draws each living state's update day; on it the state's pools grow and its
/// monthly steps run; the declaration evaluation is the typed DeclarationEngine fed from the run, and a
/// declared war is registered with its coalition, declaration record, cooldowns and chronicle entry.
public enum DiplomacyBridge {
    static let f = Native.fr
    static let polities = ["Kingdom", "Empire", "Federation", "Republic", "Tribal", "Theocracy"]
    static let cultures = ["chinese", "japanese", "english", "arab", "roman", "french", "german", "greek", "persian", "slavic", "norse", "indian"]
    /// Wars and losses follow-up after a declaration (reconcileWar26 + reconcileLosses), set by the engine.
    public static var reconcileWarPlans: ((JS) -> Void)?

    static func accumulate(_ pools: JS, _ factor: Double) {
        pools.efficiency = JS(f(factor)); let e = pools.efficiency.asNumber
        pools.power = JS(f(f(pools.power.asNumber) + e)); pools.endWar = JS(f(f(pools.endWar.asNumber) + e)); pools.startWar = JS(f(f(pools.startWar.asNumber) + e))
    }
    static func month(_ r: JS) -> Int { r.life.currentDate.year.asInt * 12 + r.life.currentDate.month.asInt - 1 }
    static func daysInMonth(_ r: JS) -> Int { let d = r.life.currentDate; return DiplomacyCalendar.monthLength(d.year.asInt, d.month.asInt) }
    static func drawDay(_ r: JS) -> Int { 1 + Int((Diplomatic.random(r.nativeDiplomacy) * Double(daysInMonth(r))).rounded(.down)) }

    /// relation46: the pair's diplomatic history, created on first use.
    @discardableResult
    static func relation(_ r: JS, _ a: String, _ b: String) -> JS {
        let s = r.nativeDiplomacy
        if let old = s.relations.asArray.first(where: { $0.a.asString == a && $0.b.asString == b || $0.a.asString == b && $0.b.asString == a }) { return old }
        let unknown = s.nations[a].origin.asString == "explicit-copy" && s.nations[b].origin.asString == "explicit-copy"
        let p = JS.object()
        p.a = JS(a < b ? a : b); p.b = JS(a < b ? b : a); p.history = JS(unknown ? "unknown" : "complete"); p.lastWar = unknown ? .null : JS(-200); p.warCount = unknown ? .null : JS(0); p.endedWarIds = .array()
        s.relations.push(p); Vassals.bump(s)
        return p
    }
    /// reconcileNativeDiplomacy46: each ended war counts once for its pairs.
    public static func reconcile(_ r: JS) {
        let s = r.nativeDiplomacy
        for w in r.nativeWars.campaigns.asArray where !w.endedTick.isNull {
            for (a, b) in Wars.diplomaticEndPairs(r.nativeWars, w) {
                let p = relation(r, a, b)
                if p.endedWarIds.asArray.contains(where: { $0.asInt == w.id.asInt }) { continue }
                p.endedWarIds.push(w.id.clone())
                if !p.warCount.isNull { p.warCount = JS(p.warCount.asNumber + 1) }
                p.lastWar = JS(f(r.life.gameTime.asNumber)); Vassals.bump(s)
            }
        }
    }
    /// advanceDiplomaticSchedule46.
    public static func schedule(_ r: JS, update: (String) -> Void) {
        reconcile(r)
        let s = r.nativeDiplomacy
        if r.world.day.asInt == s.lastDay.asInt { return }
        let m = month(r), live = Set(r.world.provinces.asArray.map(\.controller.asString))
        if m != s.month.asInt { s.month = JS(m); for n in r.world.nations.asArray where live.contains(n.id.asString) { s.nations[n.id.asString].updateDay = JS(drawDay(r)) } }
        s.lastDay = r.world.day.clone(); Vassals.bump(s)
        for n in r.world.nations.asArray {
            let id = n.id.asString, d = s.nations[id]
            if !live.contains(id) || d.updateDay.asInt > r.life.currentDate.day.asInt || d.updatedMonth.asInt == m { continue }
            accumulate(d.pools, 20); d.updatedMonth = JS(m); update(id)
        }
    }

    // MARK: Declarations
    /// diplomacySnapshot: the typed world the declaration engine reads.
    public static func world(_ r: JS) -> DiplomacyWorld {
        let w = r.world, s = r.nativeDiplomacy
        var index = [String: Int](), provinceIndex = [String: Int]()
        for (i, n) in w.nations.asArray.enumerated() { index[n.id.asString] = i }
        for (i, p) in w.provinces.asArray.enumerated() { provinceIndex[p.id.asString] = i }
        let alliances = r.alliances.records.asArray
        let start = r.life.startDate
        let cargo = r.transports.cargo.isNull ? [] : r.transports.cargo.asArray.map(\.army)
        let nations = w.nations.asArray.map { n -> DiplomacyWorld.Nation in
            let id = n.id.asString, d = s.nations[id], leaderId = r.people.nations[id].leaderId
            let p = leaderId.isNull ? nil : r.people.persons[leaderId.asInt.description]
            let alliance = Vassals.allianceOf(r, id).flatMap { a in alliances.firstIndex { $0 === a } } ?? -1
            let lord = Vassals.overlord(r, id).flatMap { index[$0] } ?? -1
            let leader = p.map { p in
                DiplomacyWorld.Leader(alive: p.alive.optionalBool == true, traits: p.traits.asArray.map { t in DiplomacyWorld.Trait(name: t.asString, bonus: Nobility.trait(t.asString)?.relationshipBonus.optionalNumber ?? 0) }, diplomatic: People.skills(p).diplomatic)
            }
            return DiplomacyWorld.Nation(id: r.people.nations[id].id.asInt, provinces: Wars.orderedProvinces(r, id).map { provinceIndex[$0.id.asString]! }, overlord: lord, auto: r.diplomacy.nations[id].optionalBool == true,
                                         expansionism: d.expansionism.asNumber, culture: (cultures.firstIndex(of: r.civilization.nations[id].cultureId.asString) ?? -1) + 1,
                                         polity: polities.firstIndex(of: r.upperCombat.nations[id].polity.asString) ?? -1, alliance: alliance, leader: leader,
                                         activeTime: d.activeTime.optionalNumber, passiveTime: d.passiveTime.optionalNumber,
                                         pools: DiplomacyWorld.Pools(power: d.pools.power.asNumber, startWar: d.pools.startWar.asNumber, endWar: d.pools.endWar.asNumber, efficiency: d.pools.efficiency.asNumber),
                                         strength: PeaceBridge.strength(r, id),
                                         troops: (w.armies.asArray + cargo).filter { $0.nationId.asString == id && $0.status.asString != "destroyed" }.map(\.troops.asInt),
                                         ships: (r.navy.fleets.isNull ? [] : r.navy.fleets.asArray).filter { $0.nationId.asString == id && $0.status.asString != "lost" }.map(\.ships.asInt))
        }
        return DiplomacyWorld(gameTime: r.life.gameTime.asNumber, originTime: s.originTime.asNumber, secondsPerDay: r.life.secondsPerDay.asNumber,
                              start: DiplomacyWorld.Start(year: start.year.asInt, month: start.month.asInt, day: start.day.asInt), day: w.day.asInt, worldAuto: r.diplomacy.worldAuto.isTruthy,
                              rng: UInt32(truncatingIfNeeded: Int64(s.rng.asNumber)), draws: s.draws.asInt, nations: nations,
                              cultures: w.provinces.asArray.map { (cultures.firstIndex(of: r.sovereignty.provinces[$0.id.asString].mapCultureId.asString) ?? -1) + 1 },
                              connected: w.provinces.asArray.map { r.upperCombat.provinces[$0.id.asString].connected.optionalBool == true },
                              relations: s.relations.asArray.map { DiplomacyWorld.Relation(a: index[$0.a.asString]!, b: index[$0.b.asString]!, lastWar: $0.lastWar.optionalNumber, warCount: $0.warCount.optionalNumber.map { Int($0) }) },
                              statecraft: w.statecraft.relations.asArray.map { DiplomacyWorld.Statecraft(a: index[$0.a.asString]!, b: index[$0.b.asString]!, war: $0.status.asString == "war", truceUntilDay: $0.truceUntilDay.optionalNumber.map { Int($0) } ?? 0) },
                              alliances: alliances.map { DiplomacyWorld.Alliance(ended: !$0.endedTick.isNull, members: $0.members.asArray.map { index[$0.asString]! }) },
                              vassals: r.vassals.records.asArray.filter { $0.endedTick.isNull }.map { [index[$0.overlordId.asString]!, index[$0.vassalId.asString]!] })
    }
    /// Pairs the typed evaluation touched for the first time become relation rows, in that order.
    static func mirrorRelations(_ r: JS, _ w: DiplomacyWorld, from known: Int) {
        for p in w.relations.dropFirst(known) { relation(r, r.world.nations[p.a].id.asString, r.world.nations[p.b].id.asString) }
    }
    /// evaluateDeclaration47 for one state on its update day.
    @discardableResult
    public static func evaluateDeclaration(_ r: JS, _ nationId: String, engine: DeclarationEngine) -> JS? {
        guard let i = r.world.nations.asArray.firstIndex(where: { $0.id.asString == nationId }) else { return nil }
        var w = world(r)
        let known = w.relations.count
        let declared = engine.evaluate(&w, nation: i)
        mirrorRelations(r, w, from: known)
        let s = r.nativeDiplomacy
        s.rng = JS(Double(w.rng)); s.draws = JS(w.draws)
        s.nations[nationId].pools.startWar = JS(w.nations[i].pools.startWar)
        guard let declared else { return nil }
        return start(r, declared)
    }
    static func start(_ r: JS, _ d: DeclaredWar) -> JS {
        // The typed declaration names nations by index; goals and records use state numbers.
        let a = r.world.nations[d.attacker].id.asString, b = r.world.nations[d.defender].id.asString
        let attackerId = Wars.stateNumber(r, a), defenderId = Wars.stateNumber(r, b)
        let members = Vassals.buildParticipants(r, attacker: a, defender: b)
        Vassals.openCoalitionRelations(r, members)
        let goals = JS.array(d.goals.map { g in
            let o = JS.object(); o.id = JS(g.id); o.type = JS(g.type); o.addedBy = JS(attackerId); o.target = JS(defenderId); o.beneficiary = JS(attackerId)
            let scope = JS.object(); scope.provinceIds = .array(g.scope.map { JS($0) }); scope.requiredCount = JS(g.requiredCount); o.scope = scope
            return o
        })
        let war = Wars.register(r, attacker: a, defender: b, goals: goals, members: members)
        let decl = JS.object()
        decl.warId = war.id.clone(); decl.attackerId = JS(attackerId); decl.defenderId = JS(defenderId); decl.casusBelliId = JS(d.casusBelli)
        decl.goals = .array(goals.asArray.enumerated().map { i, g in
            let o = JS.object(); o.id = g.id.clone(); o.type = g.type.clone(); o.addedBy = g.addedBy.clone(); o.target = g.target.clone(); o.beneficiary = g.beneficiary.clone()
            o.primary = JS(i == 0); o.scopeType = JS([3, 4, 11].contains(g.type.asInt) ? 3 : 0); o.scope = g.scope.clone(); o.districtId = JS(0); o.secondaryStateId = JS(0)
            return o
        })
        let s = r.nativeDiplomacy
        s.declarations.push(decl); s.nations[a].activeTime = JS(f(r.life.gameTime.asNumber)); s.nations[b].passiveTime = JS(f(r.life.gameTime.asNumber)); Vassals.bump(s)
        reconcileWarPlans?(r)
        let an = Vassals.name(r, a), bn = Vassals.name(r, b)
        let reason = "\(DeclarationText.casusBelli(d.casusBelli))。\(PeaceBridge.warDetails(r, war))"
        let side0 = members.asArray.filter { $0.side.asInt == 0 }.count, side1 = members.asArray.filter { $0.side.asInt == 1 }.count
        let goal = decl.goals.asArray.first { $0.primary.asBool } ?? decl.goals.asArray.first
        var text = "\(an)以\(DeclarationText.casusBelli(d.casusBelli))为由对\(bn)宣战，目标：\(goal.map { PeaceBridge.goalText($0.type.asInt, $0.scope.provinceIds.length) } ?? "未知")"
        if side0 > 1 || side1 > 1 { text += "（\(an)方\(side0)国 vs \(bn)方\(side1)国）" }
        let w = r.world, eventId = w.nextEventId.asNumber
        let e = JS.object(); e.id = JS(eventId); e.day = w.day.clone(); e.kind = JS("diplomacy"); e.text = JS(text); e.reason = JS(reason)
        w.nextEventId = JS(eventId + 1); w.events.push(e)
        if w.events.length > 160 { w.events.asArray = Array(w.events.asArray.suffix(160)) }
        for (id, action) in [(a, "宣战"), (b, "应战")] {
            if let policy = w.statecraft.nations.asArray.first(where: { $0.nationId.asString == id }) {
                let decision = JS.object(); decision.day = w.day.clone(); decision.action = JS(action); decision.reason = JS(reason); policy.lastDecision = decision
            }
        }
        People.recordHistory(r, kind: "diplomacy", text: text, reason: reason, nations: members.asArray.map { Wars.nationOf(r.nativeWars, $0.stateId.asInt) }, province: nil, source: eventId)
        return war
    }
}

public typealias DeclarationText = WarText

extension PeaceBridge {
    /// warHistoryDetails47 for an ongoing war.
    static func warDetails(_ r: JS, _ c: JS) -> String {
        let full = historyDetails(r, c)
        // historyDetails ends with the settlement summary; the ongoing form stops after the targets.
        guard let range = full.range(of: "。目标：") else { return full }
        let afterTargets = full[range.upperBound...]
        let groupsStart = full.range(of: "日。")?.upperBound ?? full.startIndex
        let groups = full[groupsStart..<range.lowerBound]
        let targets = afterTargets.components(separatedBy: "。累计军力损失").first ?? String(afterTargets)
        return "\(groups)。目标：\(targets)。部队须实际行军、交锋或登陆。"
    }
}
