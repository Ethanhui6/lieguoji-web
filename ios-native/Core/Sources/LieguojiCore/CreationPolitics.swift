import Foundation

/// 新世界的外交（civilization47-political-owner attachPolitics47：initialDiplomacy、initialNativeDiplomacy46
/// 'new-world'、initialVassalManager47）与战乱开局（initializeOpeningWars47）。
public enum CreationPolitics {
    static let f = Native.fr

    /// nativeGenerateExpansionism：1–6 之间、一位小数（银行家舍入）。
    static func expansionism(_ s: JS) -> Double {
        let x = f(f(f(f(Diplomatic.random(s))) * f(5)) + f(1))
        return f(People.roundToEven(x, digits: 1))
    }

    public static func attach(_ r: JS) {
        Government.recordStateTraits(r)
        let w = r.world, tick = r.clock.tick.asNumber
        let diplomacy = JS.object()
        diplomacy.version = JS(1); diplomacy.revision = JS(0); diplomacy.worldAuto = JS(true); diplomacy.maximumMonths = JS(240)
        let auto = JS.object(); for n in w.nations.asArray { auto[n.id.asString] = JS(true) }; diplomacy.nations = auto
        r.diplomacy = diplomacy
        let s = JS.object()
        s.version = JS(1); s.revision = JS(0); s.originTick = JS(tick); s.originTime = r.life.gameTime.clone()
        s.rng = JS(Double(CreationForces.fnv("\(w.custom.seed.asString)/diplomacy30/\(jsNumberText(tick))"))); s.draws = JS(0)
        s.month = JS(DiplomacyBridge.month(r)); s.lastDay = w.day.clone(); s.nations = .object(); s.relations = .array(); s.declarations = .array()
        r.nativeDiplomacy = s
        for n in w.nations.asArray {
            let pools = JS.object(); pools.power = JS(100); pools.startWar = JS(100); pools.endWar = JS(100); pools.efficiency = JS(0)
            DiplomacyBridge.accumulate(pools, 20)
            let e = expansionism(s)
            func range(_ lo: Double, _ hi: Double) -> Double { f(lo + f(f(Diplomatic.random(s)) * f(hi - lo))) }
            let start = f(100); pools.startWar = JS(f(range(f(start * 0), start)))
            let end = f(100); pools.endWar = JS(f(range(f(end * 0), end)))
            let o = JS.object()
            o.origin = JS("new-world"); o.parentId = .null; o.initializedTick = JS(tick); o.expansionism = JS(e)
            o.activeTime = JS(-8.988465674311579e307); o.passiveTime = JS(-8.988465674311579e307); o.pools = pools
            o.updateDay = JS(DiplomacyBridge.drawDay(r)); o.updatedMonth = JS(DiplomacyBridge.month(r) - 1)
            s.nations[n.id.asString] = o
        }
        // 开局即交战的关系（此时总是和平）：双方冷却从现在算。
        for p in w.statecraft.relations.asArray where p.status.asString == "war" {
            for id in [p.a.asString, p.b.asString] { s.nations[id].activeTime = r.life.gameTime.clone(); s.nations[id].passiveTime = r.life.gameTime.clone() }
        }
        let v = JS.object()
        v.version = JS(1); v.revision = JS(0); v.lastDay = w.day.clone(); v.enabled = JS(true); v.receipts = .array(); v.rebellions = .array()
        r.vassalManager = v
    }

    /// initializeOpeningWars47：按关系顺序，每对有可争夺土地的国家开战；需已装上静态几何（NativeEngine.install）。
    public static func openingWars(_ r: JS, engine: DeclarationEngine) {
        let nations = r.world.nations.asArray
        var index = [String: Int](); for (i, n) in nations.enumerated() { index[n.id.asString] = i }
        let c = DeclarationEngine.Context(engine: engine, world: DiplomacyBridge.world(r))
        let pairs = r.world.statecraft.relations.asArray.compactMap { p -> (String, String)? in
            let a = p.a.asString, b = p.b.asString
            guard let ai = index[a], let bi = index[b] else { return nil }
            return c.usable(1, ai, bi) != nil && c.claimEntry(ai, bi) != nil ? (a, b) : nil
        }
        for (a, b) in pairs {
            let refused = DiplomacyBridge.declareWar(r, a, b, engine: engine)
            if refused != nil { continue }
        }
        War26.reconcileForces(r, [])
        Naval.reconcileLandOwners(r)
        DiplomacyBridge.reconcile(r)
    }
}
