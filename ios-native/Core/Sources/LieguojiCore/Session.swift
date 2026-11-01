import Foundation

/// The playable advance of a world (culture47-session advance): within each day the military window
/// runs frame by frame with the family calendar, the political tick and the army orders after each
/// frame; at the day boundary the daily settlement; after every window the political step
/// (advancePolitics47: alliances, vassals, peace, then on a new day the monthly diplomacy schedule,
/// vassal manager, rebellion and families, then the war ledgers, reigns and state traits).
public enum Session {
    /// The declaration engine of the running world (diplomacy statics), set by the engine.
    public static var engine: DeclarationEngine?

    /// advanceFamilyCalendar47.
    static func calendar(_ r: JS, _ tick: Int) {
        let l = r.life
        l.gameTime = JS(Native.fr(Double(tick) / 120 * l.secondsPerDay.asNumber)); l.lastTick = JS(tick)
        if tick % 120 != 0 { return }
        let s = l.startDate, d = DiplomacyCalendar.fromDayNumber(DiplomacyCalendar.dayNumber((s.year.asInt, s.month.asInt, s.day.asInt)) + tick / 120)
        let o = JS.object(); o.year = JS(d.year); o.month = JS(d.month); o.day = JS(d.day); l.currentDate = o
    }
    /// finishPoliticalTick47.
    public static func finishPoliticalTick(_ r: JS) { PeaceBridge.advance(r, monthStart: false); Government.reconcileContinuity(r) }
    /// The real47 afterTick of the military window: calendar, then on a frame boundary the political
    /// tick (not at the day boundary) and the army batch. Fleets are not raised in current worlds.
    static func afterTick(_ r: JS, _ dailyPending: Bool, _ boundary: Bool) {
        calendar(r, r.clock.tick.asInt)
        if !boundary { return }
        if !dailyPending { finishPoliticalTick(r) }
        ArmyOrders.issueBatch(r)
    }
    /// advancePolitics47.
    public static func politics(_ r: JS, dayChanged: Bool) {
        Government.reconcileContinuity(r); Vassals.reconcileAlliances(r); Vassals.reconcileVassals(r)
        PeaceBridge.advance(r, monthStart: dayChanged); Government.reconcileContinuity(r)
        if dayChanged {
            DiplomacyBridge.schedule(r) { id in
                if let engine { DiplomacyBridge.evaluateAlliance(r, id, engine: engine); DiplomacyBridge.evaluateDeclaration(r, id, engine: engine) }
                Rebellion.stateMonth(r, id)
                if !r.nobility.isNull { Nobility.stateMonth(r, id) }
                if !r.offices47.isNull { Offices.month(r, id) }
            }
            Vassals.advanceManager(r); Rebellion.advance(r)
            if !r.nobility.isNull { Nobility.advance(r) }
            Wars.reconcileLosses(r)
        }
        DiplomacyBridge.reconcile(r); Government.recordReigns(r); Government.recordStateTraits(r)
    }
    /// Advance `ticks` world ticks: military windows up to each day boundary, the daily settlement
    /// there, and the political step after every window.
    public static func advance(_ r: JS, ticks: Int) {
        var remaining = ticks
        RunWindow.afterTick = afterTick; War26.install(); RebelWar.install(); NobleRevolt.install()
        // issueAutonomousArmyOrders47 with the army batch: only the day is recorded.
        Daily.dailyOrders = { r in if !r.armyBatch.isNull { r.armyAutonomy.lastDay = r.world.day.clone() } }
        while remaining > 0 {
            let take = min(remaining, 120 - r.clock.tick.asInt % 120)
            let out = RunWindow.advance(r, ticks: take)
            if out.dailyPending { Daily.settle(r) }
            politics(r, dayChanged: out.dailyPending)
            remaining -= take
        }
    }
}
