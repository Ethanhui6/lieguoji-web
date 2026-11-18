import Foundation

/// 新世界建成后 engine.ts 按 ENABLE 列表依次执行的七个规则启用动作：退役补军、伤军补员、原作帧循环、
/// 陆军轮转、叛乱建国、官职、原作军队（army-retirement47、army-recovery47、frame-loop47、army-batch47、
/// civilization47-rebellion enableRebellion47、civilization47-offices、civilization47-original-army）。
public enum CreationRules {
    static func object(_ pairs: [(String, JS)]) -> JS { CreationForces.object(pairs) }

    public static func enable(_ r: JS) {
        let tick = r.clock.tick.asNumber, w = r.world
        r.armyRetirement = object([("version", JS(1)), ("rule", JS("retired-roster-web-v1")), ("enabledTick", JS(tick)), ("records", .object())])
        r.armyRecovery = object([("version", JS(1)), ("rule", JS("wounded-army-recovery-web-v1")), ("enabledTick", JS(tick))])
        r.frameLoop = object([("version", JS(1)), ("rule", JS("original-frame-loop-v1")), ("enabledTick", JS(tick))])
        // 已有的攻击期限移到下一个帧边界（每帧 20 刻）。
        let deadlines = r.forceClock.deadlines
        for k in deadlines.objectKeys { deadlines[k] = JS((deadlines[k].asNumber / 20).rounded(.up) * 20) }
        r.armyBatch = object([("version", JS(1)), ("rule", JS("native-five-army-orders-web-v1")), ("cursor", JS(0)), ("lastTick", JS(tick)), ("calls", JS(0))])
        // enableFoundings47 + assignUpdateDays47。
        let d = r.life.currentDate, month = d.year.asInt * 12 + d.month.asInt - 1
        let conquered = JS.object()
        for p in w.provinces.asArray { conquered[p.id.asString] = object([("controller", p.controller.clone()), ("time", JS(0))]) }
        let foundings = object([("version", JS(1)), ("rule", JS("original-rebel-state-v1")), ("enabledTick", JS(tick)), ("revision", JS(0)), ("records", .array()),
                                ("enabled", JS(true)), ("minMonths", JS(12)), ("month", JS(month)),
                                ("random", object([("state", JS(Double(CreationForces.fnv("\(w.custom.seed.asString)/rebellion47")))), ("draws", JS(0))])),
                                ("destinyToRebel", JS(30)), ("destinyToRebelConnected", JS(20)), ("recalTime", JS(0)), ("coreMonths", .object()), ("conquered", conquered),
                                ("lastRebel", .object()), ("recent", .object()), ("updateDays", .object())])
        let days = DiplomacyCalendar.monthLength(d.year.asInt, d.month.asInt), updates = JS.object()
        for p in w.provinces.asArray { updates[p.id.asString] = JS(Rebellion.range(foundings, 1, days + 1)) }
        foundings.updateDays = updates
        r.foundings = foundings
        let books = JS.object()
        for n in w.nations.asArray { books[n.id.asString] = object([("assignments", .array()), ("reviewYear", JS(-1))]) }
        r.offices47 = object([("version", JS(1)), ("rule", JS("original-government-office-v1")), ("revision", JS(0)), ("wars", JS(1)), ("nations", books)])
        r.originalArmy47 = object([("version", JS(1)), ("rule", JS("original-army-no-rations-v1")), ("kills", .object()), ("paths", JS(1))])
        for a in w.armies.asArray where a.troops.asNumber > 0 && a.status.asString != "destroyed" { a.supplies = JS(100); a.morale = JS(100) }
    }
}
