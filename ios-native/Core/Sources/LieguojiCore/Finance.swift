import Foundation

/// 财政 (app rules): the tax policy each state may set, the treasury's monthly record, and the
/// ledger the original keeps (land taxes, the hoard's diminishing return, army upkeep, the treasury's
/// weight in battle) read out for the nation page.
public enum Finance {
    /// 轻徭薄赋, 常税, 重税: income, destiny and the people's growth each month.
    public static let policies: [(key: String, name: String, income: Double, destiny: Double, growth: Double)] = [
        ("light", "轻徭薄赋", -0.2, 0.1, 0.0015), ("normal", "常税", 0, 0, 0), ("heavy", "重税", 0.3, -0.15, -0.0015),
    ]
    static func policy(_ r: JS, _ id: String) -> (key: String, name: String, income: Double, destiny: Double, growth: Double) {
        let key = r.regimes.isNull ? "normal" : r.regimes.tax[id].optionalString ?? "normal"
        return policies.first { $0.key == key } ?? policies[1]
    }

    /// Once a month per state: the tax policy's effects, then the treasury into the 24-month record.
    static func month(_ r: JS, _ id: String, addGold: (Double) -> Void, addDestiny: (Double) -> Void) {
        let p = policy(r, id)
        if p.income != 0 { addGold(p.income) }
        if p.destiny != 0 { addDestiny(p.destiny) }
        if p.growth != 0 {
            let owned = Set(r.world.provinces.asArray.filter { $0.controller.optionalString == id }.map(\.id.asString))
            for s in r.world.statecraft.provinces.asArray where owned.contains(s.provinceId.asString) {
                s.population = JS(max(100, ((s.population.optionalNumber ?? 0) * (1 + p.growth)).rounded()))
            }
        }
        if r.regimes.treasury.isNull { r.regimes.treasury = JS.object() }
        var record = r.regimes.treasury[id].isNull ? [JS]() : r.regimes.treasury[id].asArray
        record.append(JS((r.finance.nations[id].gold.optionalNumber ?? 0).rounded()))
        r.regimes.treasury[id] = .array(Array(record.suffix(24)))
    }
}

extension NativeEngine {
    /// 财政 of one state: treasury and its record, net monthly income, land taxes, the hoard factor,
    /// army upkeep, trade, the tax policy and the treasury's battle multiplier.
    public func financeInfo(_ index: Int) -> Data? {
        let r = run, nations = r.world.nations.asArray
        guard nations.indices.contains(index) else { return nil }
        let id = nations[index].id.asString, n = r.finance.nations[id], l = n.ledger, o = JS.object()
        o.gold = JS(n.gold.optionalNumber ?? 0)
        o.net = JS(n.goldPerMonth.optionalNumber ?? 0)
        o.taxes = JS(l.baseIncome.optionalNumber ?? 0)
        o.hoard = JS(l.inventoryFactor.optionalNumber ?? 1)
        o.army = JS(n.armyCostGold.optionalNumber ?? 0)
        o.battle = JS(n.goldBattleModifier.optionalNumber ?? 1)
        let trade = Trade.share(r, id)
        o.trade = JS(((n.goldPerMonth.optionalNumber ?? 0) * trade.rate).rounded())
        let p = Finance.policy(r, id)
        o.policy = JS(p.key); o.policyName = JS(p.name)
        o.record = r.regimes.isNull || r.regimes.treasury[id].isNull ? .array() : r.regimes.treasury[id]
        return Data(o.json.utf8)
    }
    /// 纪年: an era name and the year this one should read as (display only; the simulation's clock is untouched).
    public func setCalendar(era: String, year: Int?) -> (ok: Bool, reason: String) {
        let r = run
        Regimes.enable(r)
        let c = JS.object()
        c.era = JS(String(era.trimmingCharacters(in: .whitespacesAndNewlines).prefix(6)))
        let now = r.life.currentDate.year.asInt
        c.offset = JS(year.map { $0 - now } ?? (r.regimes.calendar.isNull ? 0 : r.regimes.calendar.offset.asInt))
        r.regimes.calendar = c
        return (true, "纪年已改。")
    }
    /// 编辑行省文化: the culture of a province's city (the culture view and the people born there follow it).
    public func setCityCulture(_ province: Int, _ culture: String) -> (ok: Bool, reason: String) {
        let r = run, provinces = r.world.provinces.asArray
        guard provinces.indices.contains(province), !culture.isEmpty else { return (false, "州郡或文化无效。") }
        let pid = provinces[province].id.asString
        guard let city = r.world.cities.asArray.first(where: { $0.provinceId.asString == pid }) else { return (false, "此州郡没有城市。") }
        let c = r.civilization.cities[city.id.asString]
        guard !c.isNull else { return (false, "此城没有文化记录。") }
        c.cultureId = JS(culture)
        return (true, "本地文化已更改。")
    }
    /// 税率: light, normal or heavy.
    public func setTax(_ index: Int, _ policy: String) -> (ok: Bool, reason: String) {
        let r = run, nations = r.world.nations.asArray
        guard nations.indices.contains(index), Finance.policies.contains(where: { $0.key == policy }) else { return (false, "无此税制。") }
        Regimes.enable(r)
        if r.regimes.tax.isNull { r.regimes.tax = JS.object() }
        r.regimes.tax[nations[index].id.asString] = JS(policy)
        return (true, "税制改为\(Finance.policies.first { $0.key == policy }!.name)。")
    }
}
