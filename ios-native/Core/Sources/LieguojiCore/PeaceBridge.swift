import Foundation

/// JavaScript Number → string for the integral and ordinary values the chronicle prints.
func jsNumber(_ d: Double) -> String { d == d.rounded() && abs(d) < 1e21 ? String(Int64(d)) : "\(d)" }

/// War settlement on the run state (civilization47-war-settlement settleWar47 / advancePeace47): the
/// peace AI and treaty execution are the typed ports (PeaceAI, Settlement) fed from the run; their
/// transfers and reparations are written back province by province, the opposed pairs make peace with
/// a ten-day truce, and the war is closed with its chronicle entry.
public enum PeaceBridge {
    static let f = Native.fr
    static let lossThreshold: [String: Double] = ["Kingdom": 0.5, "Empire": Native.fr(0.45), "Federation": Native.fr(0.55), "Republic": 0.5, "Tribal": Native.fr(0.6), "Theocracy": 0.5]
    /// Follow-up reconciliation after a settlement (reconcileDiplomaticForces47), set by the engine.
    public static var reconcileForces: ((JS, Set<String>) -> Void)?

    /// war26Strength.
    public static func strength(_ r: JS, _ nation: String) -> Double {
        var army = 0.0, navy = 0.0
        let cargo = r.transports.cargo.isNull ? [] : r.transports.cargo.asArray.map(\.army)
        for a in r.world.armies.asArray + cargo where a.nationId.asString == nation && a.status.asString != "destroyed" { army = f(army + f(f(max(0, a.troops.asNumber)) / f(2000))) }
        for n in (r.navy.fleets.isNull ? [] : r.navy.fleets.asArray) where n.nationId.asString == nation && n.status.asString != "lost" { navy = f(navy + f(f(max(0, min(5, n.ships.asNumber))) / f(5))) }
        let land = Double(r.world.provinces.asArray.filter { $0.controller.asString == nation }.count)
        return f(f(f(f(navy + navy) + f(army + army)) + f(f(land) * f(5))) + f(1))
    }
    static func pairs(_ list: JS) -> [[Int]] { list.asArray.map { [$0[0].asInt, $0[1].asInt] } }
    /// nativeWar46 as the typed peace war.
    static func war(_ c: JS) -> PeaceWar {
        let all = c.coalition.isNull ? c.participants.asArray + c.destroyedParticipants.asArray : c.coalition.members.asArray
        func primary(_ side: Int) -> Int { all.first { $0.side.asInt == side && (!$0.has("isPrimary") || $0.isPrimary.asBool) }!.stateId.asInt }
        func members(_ l: JS) -> [PeaceWar.Participant] { l.asArray.map { PeaceWar.Participant(stateId: $0.stateId.asInt, side: $0.side.asInt) } }
        let goals = c.goals.asArray.map { g in
            PeaceWar.Goal(id: g.id.optionalNumber.map { Int($0) } ?? 0, type: g.type.asInt, addedBy: g.addedBy.asInt, target: g.target.asInt, beneficiary: g.beneficiary.asInt,
                          provinceIds: g.scope.isNull || g.scope.provinceIds.isNull ? nil : g.scope.provinceIds.asArray.map(\.asInt), requiredCount: g.scope.isNull ? 0 : g.scope.requiredCount.optionalNumber.map { Int($0) } ?? 0, hasScope: !g.scope.isNull)
        }
        return PeaceWar(id: c.id.asInt, internal: !c.internal.isNull, legacyWarType: c.internal.isNull ? 0 : c.internal.legacyType.asInt, primaryAttackerId: primary(0), primaryDefenderId: primary(1),
                        startTime: c.startTime.asNumber, participants: members(c.participants), destroyedParticipants: members(c.destroyedParticipants), goals: goals,
                        initialOwners: pairs(c.initialOwners), initialProvinceCounts: pairs(c.initialProvinceCounts), initialCapitals: pairs(c.initialCapitals),
                        kills: c.kills.asArray.map { [$0[0].asNumber, $0[1].asNumber] }, deaths: c.deaths.asArray.map { [$0[0].asNumber, $0[1].asNumber] })
    }
    /// The world as the peace queries read it.
    static func world(_ r: JS) -> PeaceWorld {
        var index = [String: Int]()
        for (i, p) in r.world.provinces.asArray.enumerated() { index[p.id.asString] = i + 1 }
        let start = r.life.startDate
        return PeaceWorld(gameTime: r.life.gameTime.asNumber, secondsPerDay: r.life.secondsPerDay.asNumber, start: DiplomacyWorld.Start(year: start.year.asInt, month: start.month.asInt, day: start.day.asInt),
                          provinceStates: r.world.provinces.asArray.map { Wars.stateNumber(r, $0.controller.asString) },
                          states: r.world.nations.asArray.map { n in
                              let id = n.id.asString, fin = r.finance.nations[id]
                              return PeaceWorld.State(id: Wars.stateNumber(r, id), dead: !r.world.provinces.asArray.contains { $0.controller.asString == id },
                                                      provinces: Wars.orderedProvinces(r, id).map { index[$0.id.asString]! }, gold: fin.gold.asNumber, goldPerMonth: fin.goldPerMonth.asNumber,
                                                      armyCostGold: fin.armyCostGold.asNumber, strength: strength(r, id), lossThreshold: f(lossThreshold[r.civilization.nations[id].polity.asString]!),
                                                      autonomous: r.diplomacy.nations[id].optionalBool == true)
                          })
    }
    static func nation(_ r: JS, _ stateId: Int) -> String { Wars.nationOf(r.nativeWars, stateId) }
    static func transferEconomy(_ r: JS, _ province: String, _ from: String, _ to: String) {
        let s = r.world.statecraft
        if s.isNull { return }
        let grain = s.provinces.asArray.first { $0.provinceId.asString == province }!.grain.asNumber
        for (id, sign) in [(from, -1.0), (to, 1.0)] {
            let ledger = s.nations.asArray.first { $0.nationId.asString == id }!.lastLedger
            if !ledger.isNull && ledger.day.optionalNumber == r.world.day.asNumber {
                ledger.territoryTransfer = JS(ledger.territoryTransfer.asNumber + sign * grain); ledger.closingGrain = JS(ledger.closingGrain.asNumber + sign * grain)
            }
        }
    }
    static func stripOffice(_ r: JS, _ provinceNumber: Int) {
        for n in r.people.nations.objectValues {
            let old = n.offices.assignments.isNull ? [] : n.offices.assignments.asArray
            let next = old.filter { $0.isNull || $0.officeId.optionalString != "Governor" || $0.scopeId.optionalNumber != Double(provinceNumber) }
            if next.count != old.count { n.offices.assignments = .array(next); n.offices.revision = JS(n.offices.revision.asNumber + 1); r.people.revision = JS(r.people.revision.asNumber + 1) }
        }
    }
    static let goalDesc = [0: "索取", 1: "索取", 2: "占领"]
    static func goalText(_ type: Int, _ count: Int) -> String {
        switch type {
        case 0, 1: return "索取\(count)省"
        case 2: return "占领\(count)省"
        case 3: return "吞并全境"
        case 4: return "附庸"
        case 6: return "索取赔款"
        case 7: return "独立"
        case 8: return "推翻统治"
        case 9: return "改革政体"
        case 10: return "夺取王位"
        case 11: return "迫使目标改信本国宗教"
        default: return "未知"
        }
    }
    static func duration(_ months: Int) -> String { months >= 12 ? (months % 12 != 0 ? "\(months / 12)年\(months % 12)个月" : "\(months / 12)年") : "\(months)个月" }
    static func settledText(aggressor: String, defender: String, winnerSide: Int?, annexed: Bool, reason: Int, goal: JS?, ceded: Int, months: Int) -> String {
        let why: String
        switch reason {
        case 0: why = goal.map { "达成目标：\(goalText($0.type.asInt, $0.scope.isNull || $0.scope.provinceIds.isNull ? 0 : $0.scope.provinceIds.length))" } ?? "达成目标"
        case 1: why = "战局已定"
        case 2, 3: why = "对方崩溃"
        case 4: why = "久战厌兵"
        case 9: why = "首都沦陷"
        default: why = ""
        }
        let tail = why.isEmpty ? "" : "，\(why)"
        let winner = winnerSide == 1 ? defender : aggressor, loser = winnerSide == 1 ? aggressor : defender
        let base = annexed ? "\(winner)击灭并吞并\(loser)\(tail)" : winnerSide == 0 ? "\(aggressor)战胜\(defender)\(tail)\(ceded > 0 ? "，割得\(ceded)省" : "")" : winnerSide == 1 ? "\(defender)击退\(aggressor)\(tail)" : "\(aggressor)与\(defender)停战\(tail)"
        return "\(base)，历时\(duration(months))"
    }
    static func historyDetails(_ r: JS, _ c: JS) -> String {
        func name(_ id: Int) -> String { let key = r.nativeWars.nationIds.asArray.first { $0[0].asInt == id }?[1].asString; return r.world.nations.asArray.first { $0.id.optionalString == key }?.name.asString ?? "未记录国家" }
        let all = c.coalition.isNull ? c.participants.asArray + c.destroyedParticipants.asArray : c.coalition.members.asArray
        let sides = [0, 1].map { side -> [Int] in var ids = [Int](); for m in all where m.side.asInt == side && !ids.contains(m.stateId.asInt) { ids.append(m.stateId.asInt) }; return ids }
        let complete = c.history.asString == "complete"
        func sideName(_ i: Int) -> String { complete ? (i == 0 ? "进攻" : "防守") : (i == 0 ? "记录方一" : "记录方二") }
        let groups = sides.enumerated().map { i, ids in "\(sideName(i))阵营（\(ids.count)国）：\(ids.prefix(4).map(name).joined(separator: "、"))\(ids.count > 4 ? "等" : "")" }.joined(separator: "；")
        let targets = !complete ? "开战理由和原始目标未记录。" : c.goals.asArray.map { g -> String in
            let ids = g.scope.isNull || g.scope.provinceIds.isNull ? [] : g.scope.provinceIds.asArray.map(\.asInt)
            let places = ids.prefix(3).map { id in r.world.provinces.asArray.first { $0.id.asString == r.nativeWars.provinceIds[id - 1].asString }?.name.asString ?? "未记录地区" }.joined(separator: "、")
            let scope = "\(places)\(ids.count > 3 ? "等" : "")\(ids.count)处地区"
            switch g.type.asInt {
            case 1: return "割让\(scope)"
            case 2: return "在\(scope)中控制\(g.scope.isNull ? 0 : g.scope.requiredCount.optionalNumber.map { Int($0) } ?? 0)处"
            case 3: return "吞并\(name(g.target.asInt))"
            case 6: return "由\(name(g.target.asInt))向\(name(g.beneficiary.asInt))支付战争赔款"
            default: return "目标\(g.id.optionalNumber.map { jsNumber($0) } ?? "undefined")（类型\(g.type.asInt)）"
            }
        }.joined(separator: "；")
        let ended = c.endedTick.optionalNumber ?? r.clock.tick.asNumber
        let elapsed = ((ended - c.openedTick.asNumber) / 120 * 10 + 0.5).rounded(.down) / 10
        let loss = sides.enumerated().map { i, ids in
            let sum = c.deaths.asArray.filter { ids.contains($0[0].asInt) }.reduce(0.0) { $0 + $1[1].asNumber }
            return "\(sideName(i)) \(jsNumber((sum * 100 + 0.5).rounded(.down) / 100))"
        }.joined(separator: "、")
        let s = c.settlement
        return "\(complete ? "历时" : "自本局记录起经过")\(jsNumber(elapsed))日。\(groups)。目标：\(targets)。累计军力损失：\(loss.isEmpty ? "0" : loss)（原作战分单位，非阵亡人数）。本次和约执行\(s.isNull ? 0 : s.transfers.length)项转地、确认\(s.isNull ? 0 : s.confirmedOwnership.length)处实控归属。"
    }

    /// settleWar47 for wars the typed treaty ports cover (external wars and player-ordered ends).
    @discardableResult
    public static func settle(_ r: JS, _ c: JS, reason: Int) -> Bool {
        if !c.endedTick.isNull { return false }
        let s = r.nativeWars, participants = Wars.participantNations(s, c), complete = c.history.asString == "complete"
        var result: Settlement.Result?
        var confirmed = [JS]()
        if complete {
            var w = world(r)
            result = Settlement.settle(war: war(c), world: &w, reason: reason)
            if let result {
                for t in result.applied {
                    let p = r.world.provinces.asArray.first { $0.id.asString == s.provinceIds[t.provinceId - 1].asString }!, owner = nation(r, t.to)
                    if p.controller.asString != owner { transferEconomy(r, p.id.asString, p.controller.asString, owner) }
                    p.controller = JS(owner)
                    if participants.contains(p.legalOwner.asString) { p.legalOwner = JS(owner) }
                    stripOffice(r, t.provinceId); Wars.reconcileCore(r); Wars.reconcileParticipants(r)
                }
                // Reparations were paid on the typed world in effect order; its treasuries are written back.
                for st in w.states { let fin = r.finance.nations[nation(r, st.id)]; if fin.gold.asNumber != st.gold { fin.gold = JS(st.gold) } }
                for pair in c.initialOwners.asArray {
                    let pid = pair[0].asInt, original = pair[1].asInt
                    let p = r.world.provinces.asArray.first { $0.id.asString == s.provinceIds[pid - 1].asString }!, owner = Wars.stateNumber(r, p.controller.asString)
                    if owner != original && participants.contains(p.controller.asString) && participants.contains(p.legalOwner.asString) {
                        if p.legalOwner.asString != p.controller.asString { p.legalOwner = p.controller.clone(); stripOffice(r, pid) }
                        confirmed.append(.array([JS(pid), JS(owner)]))
                    }
                }
            }
        }
        for (a, b) in Wars.opposedPairs(s, c) {
            if s.campaigns.asArray.contains(where: { $0 !== c && $0.endedTick.isNull && Wars.coversPair($0, s, a, b) }) { continue }
            let rel = Wars.relation(r, a, b)!
            rel.status = JS("peace"); rel.sinceDay = r.world.day.clone(); rel.truceUntilDay = JS(r.world.day.asNumber + 10)
        }
        if complete {
            let o = JS.object()
            o.reason = JS(reason); o.tick = r.clock.tick.clone(); o.winnerSide = result?.winnerSide.map { JS($0) } ?? .null
            o.outcomes = .array((result?.outcomes ?? []).map { .array($0.map { JS($0) }) }); o.enforcedGoals = .array((result?.enforcedGoals ?? []).map { JS($0) })
            o.transfers = .array((result?.applied ?? []).map { t in let x = JS.object(); x.sourceGoalId = JS(t.sourceGoalId); x.provinceId = JS(t.provinceId); x.from = JS(t.from); x.to = JS(t.to); x.type = JS(t.type); return x })
            o.effects = .array((result?.effects ?? []).map { e in let x = JS.object(); x.sourceGoalId = JS(e.sourceGoalId); x.type = JS(e.type); x.beneficiary = JS(e.beneficiary); x.target = JS(e.target); x.status = JS(e.status); x.reason = .null; return x })
            o.confirmedOwnership = .array(confirmed)
            c.settlement = o
        } else { c.settlement = .null }
        c.endedTick = r.clock.tick.clone(); Wars.revise(s)
        let names = c.nations.asArray.map { id in r.world.nations.asArray.first { $0.id.asString == id.asString }!.name.asString }
        func nameOf(_ id: JS, _ fallback: String) -> String { r.world.nations.asArray.first { $0.id.optionalString == id.optionalString }?.name.asString ?? fallback }
        let declaration = r.nativeDiplomacy.declarations.asArray.first { $0.warId.asInt == c.id.asInt }
        let goal = declaration.flatMap { d in d.goals.asArray.first { $0.primary.isTruthy } ?? d.goals.asArray.first }
        let text = settledText(aggressor: nameOf(c.attacker, names[0]), defender: nameOf(c.defender, names[1]), winnerSide: result?.winnerSide == 0 || result?.winnerSide == 1 ? result?.winnerSide : nil,
                               annexed: result?.annexation ?? false, reason: reason, goal: goal, ceded: result?.applied.count ?? 0, months: Int(((c.endedTick.asNumber - c.openedTick.asNumber) / 120 / 30).rounded(.down)))
        let prefix = reason == 11 ? "玩家干预停战，不执行割地和赔款。" : result != nil ? "按原作和约规则执行：\(result!.applied.count)项转地。" : "开局缺少宣战史，只结束已失去参战条件的战争，不编造条款。"
        People.announce(r, kind: "diplomacy", text: text, reason: prefix + historyDetails(r, c) + "其他仍在进行的战争保留。", nations: participants, province: nil)
        reconcileForces?(r, Set(participants))
        return true
    }
    /// advancePeace47.
    public static func advance(_ r: JS, monthStart: Bool) {
        let s = r.nativeWars
        for id in s.campaigns.asArray.filter({ $0.endedTick.isNull }).map(\.id.asInt) {
            let c = s.campaigns.asArray.first { $0.id.asInt == id }!
            if c.nations.asArray.contains(where: { n in !r.world.provinces.asArray.contains { $0.controller.asString == n.asString } }) { settle(r, c, reason: 2) }
        }
        if !monthStart || !r.diplomacy.worldAuto.isTruthy || r.life.currentDate.day.asInt != 1 { return }
        func complete() -> [JS] { s.campaigns.asArray.filter { $0.endedTick.isNull && $0.history.asString == "complete" } }
        let w = world(r)
        let maximum = r.diplomacy.maximumMonths.asInt, start = People.start(r), spd = r.life.secondsPerDay.asNumber
        func monthsSince(_ t: Double) -> Int { DiplomacyCalendar.wholeMonths(DiplomacyCalendar.date(t, secondsPerDay: spd, start: start), DiplomacyCalendar.date(f(w.gameTime), secondsPerDay: spd, start: start)) }
        for id in maximum <= 0 ? [] : complete().filter({ $0.internal.isNull && monthsSince($0.startTime.asNumber) >= maximum }).map { $0.id.asInt } {
            if let c = complete().first(where: { $0.id.asInt == id }) { settle(r, c, reason: 4) }
        }
        for id in complete().map(\.id.asInt) {
            let c = s.campaigns.asArray.first { $0.id.asInt == id }!
            if !c.endedTick.isNull { continue }
            let ai = PeaceAI(war: war(c), world: world(r))
            if !ai.hasAutonomousParticipant() { continue }
            if let reason = ai.decide() { settle(r, c, reason: reason) }
        }
    }
}

extension JS {
    var optionalBool: Bool? { if case .bool(let b) = storage { return b }; return nil }
}
