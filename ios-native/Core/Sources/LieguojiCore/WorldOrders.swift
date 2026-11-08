import Foundation

/// The world-level orders of the original's AI and rule settings (web civilization47-global-orders:
/// diplomacy, alliances, rebellion, families, vassals) and the 触发内战 state action
/// (civil-war-trigger47, StateInfoUI.OnTriggerCivilWarButtonClicked).
extension NativeEngine {
    /// The current settings, for the edict panel.
    public func worldSettings() -> Data {
        let r = run, o = JS.object()
        o.worldAuto = JS(r.diplomacy.worldAuto.isTruthy)
        o.maximumMonths = JS(r.diplomacy.maximumMonths.optionalNumber ?? 0)
        o.alliances = JS(r.alliances.enabled.isTruthy)
        o.rebellion = r.foundings.isNull ? .null : JS(r.foundings.enabled.isTruthy)
        o.rebellionMonths = JS(r.foundings.isNull ? 0 : r.foundings.minMonths.optionalNumber ?? 0)
        let st = r.nobility.isNull ? JS.null : r.nobility.settings
        o.families = st.isNull ? .null : JS(st.allowFamilyRebellion.isTruthy)
        o.familyMonths = JS(st.isNull ? 0 : st.familyRebelMinMonths.optionalNumber ?? 0)
        o.civilWar = st.isNull ? .null : JS(st.allowCivilWar.isTruthy)
        o.civilMonths = JS(st.isNull ? 0 : st.civilWarMinMonths.optionalNumber ?? 0)
        o.vassals = r.vassalManager.isNull ? .null : JS(r.vassalManager.enabled.isTruthy)
        return Data(o.json.utf8)
    }

    /// One edict: key and value (a switch is 0/1, an interval in months).
    public func setWorld(_ key: String, _ value: Int) -> (ok: Bool, reason: String) {
        let r = run
        func months(_ max: Int) -> Bool { value >= 0 && value <= max }
        var reason = ""
        switch key {
        case "clearHistory": r.chronicle.entries = .array([]); return (true, "大事记已清空。")
        case "stopWars": return stopAllWars()
        case "dissolveAlliances": return dissolveAllAlliances()
        case "worldAuto":
            let on = value != 0
            if on == r.diplomacy.worldAuto.isTruthy { return (false, "世界自动外交没有变化。") }
            reason = "\(on ? "开启" : "关闭")世界自动外交。"
            let details = on ? "各国按各自开关恢复自主外交，并检查战争期限。" : "暂停自主宣战、自动议和与战争期限检查。"
            Vassals.bump(r.diplomacy); r.diplomacy.worldAuto = JS(on)
            Daily.event(r, "system", reason, details + " 已在进行的战争、行军、战斗和补给继续；玩家仍可手动干预。")
        case "maximumMonths":
            if !months(480) { return (false, "战争期限须为 0 至 480 的整数月。") }
            if Double(value) == r.diplomacy.maximumMonths.optionalNumber { return (false, "战争期限没有变化。") }
            reason = value > 0 ? "将最长战争期限设为 \(value) 个月。" : "关闭最长战争期限。"
            Vassals.bump(r.diplomacy); r.diplomacy.maximumMonths = JS(value)
            Daily.event(r, "system", reason, "每月首日检查开战后的完整历月；达到期限后，普通外战按实际战局结算，并非无条件白和。 仅在世界自动外交开启时生效；国家单独关闭自动外交不豁免这一世界期限。 确认只改变设置，下次月初检查生效；缩短期限可能使正在进行的战争提前进入结算。")
        case "alliances":
            let on = value != 0
            if on == r.alliances.enabled.isTruthy { return (false, "联盟开关已变化。") }
            r.alliances.enabled = JS(on); Vassals.bump(r.alliances)
            reason = on ? "允许各国自主结盟" : "暂停各国自主结盟"
            People.announce(r, kind: "diplomacy", text: reason, reason: "全局指令：只改变今后的自主结盟，已有联盟保留。", nations: [], province: nil)
        case "rebellion", "rebellionMonths":
            let s = r.foundings
            if s.isNull { return (false, "本世界未启用叛乱规则。") }
            if key == "rebellion" { if (value != 0) == s.enabled.isTruthy { return (false, "叛乱设置无效或未变化。") }; s.enabled = JS(value != 0) }
            else { if !months(240) || Double(value) == s.minMonths.optionalNumber { return (false, "叛乱设置无效或未变化。") }; s.minMonths = JS(value) }
            Vassals.bump(s); reason = key == "rebellion" ? (value != 0 ? "允许行省叛乱" : "禁止行省叛乱") : "叛乱间隔设为 \(value) 个月"
        case "families", "familyMonths", "civilWar", "civilMonths":
            if r.nobility.isNull { return (false, "本世界未使用原作家族规则。") }
            let st = r.nobility.settings
            let field = ["families": "allowFamilyRebellion", "familyMonths": "familyRebelMinMonths", "civilWar": "allowCivilWar", "civilMonths": "civilWarMinMonths"][key]!
            if key == "families" || key == "civilWar" {
                if st[field].isTruthy == (value != 0) { return (false, "家族设置未变化。") }
                st[field] = JS(value != 0)
            } else {
                if !months(240) { return (false, "家族设置无效。") }
                if st[field].optionalNumber == Double(value) { return (false, "家族设置未变化。") }
                st[field] = JS(value)
            }
            reason = ["families": value != 0 ? "允许家族叛乱" : "禁止家族叛乱", "familyMonths": "家族叛乱间隔设为 \(value) 个月", "civilWar": value != 0 ? "允许内战" : "禁止内战", "civilMonths": "内战间隔设为 \(value) 个月"][key]!
        case "vassals":
            if r.vassalManager.isNull { return (false, "附庸参数无效。") }
            if (value != 0) == r.vassalManager.enabled.isTruthy { return (false, "附庸叛乱开关已变化。") }
            r.vassalManager.enabled = JS(value != 0); Vassals.bump(r.vassalManager)
            reason = value != 0 ? "允许附庸叛变" : "禁止附庸叛变"
        default:
            return (false, "未知设置。")
        }
        afterGlobalOrder()
        return (true, reason)
    }

    /// triggerCivilWar47: the two families with the worst relation to the ruling family rise (with only
    /// two families, the other one if it holds land, relation < −30 and influence > 100).
    public func triggerCivilWar(_ index: Int) -> (ok: Bool, reason: String) {
        let r = run, nations = r.world.nations.asArray
        if r.nobility.isNull { return (false, "这个世界没有启用原作家族。") }
        if r.foundings.isNull { return (false, "这个世界没有启用叛乱建国规则。") }
        guard nations.indices.contains(index), Vassals.alive(r, nations[index].id.asString) else { return (false, "当前国家无效或已灭亡") }
        let state = nations[index].id.asString, n = r.nobility
        let ruling = n.rulingFamilies[state].optionalNumber.map { String(Int($0)) } ?? r.people.nations[state].id.optionalNumber.map { String(Int($0)) } ?? ""
        if n.families[ruling].isNull { return (false, "当前国家没有统治家族，无法发动内战") }
        let families = n.families.objectKeys.filter { n.families[$0].nationId.asString == state }, others = families.filter { $0 != ruling }
        var rebels = [String]()
        if families.count == 2 {
            let other = others[0], fam = n.families[other], relation = Nobility.relation(r, other, ruling)
            if fam.controlledProvinces.length == 0 { return (false, "唯一的非统治家族没有领地") }
            if !(relation < -30 && fam.influence.asNumber > 100) {
                return (false, "内战条件不满足：与统治家族关系为\(String(format: "%.1f", relation))（需要<-30），影响力为\(String(format: "%.0f", fam.influence.asNumber))（需要>100）")
            }
            rebels = [other]
        } else {
            if families.count < 3 { return (false, "家族总数不足（只有\(families.count)个家族），无法发动内战") }
            if others.count < 2 { return (false, "非统治家族数量不足，无法发动内战") }
            if NobleRevolt.inCivilWar(r, state) { return (false, "该国已在内战中。") }
            var ranked: [(id: String, relation: Double, number: Int)] = []
            for id in others { ranked.append((id, Nobility.relation(r, id, ruling), Int(id) ?? 0)) }
            ranked.sort { a, b in a.relation != b.relation ? a.relation < b.relation : a.number < b.number }
            rebels = ranked.prefix(2).map { $0.id }
        }
        guard NobleRevolt.startCivilWar(r, state, rebels) != nil else { return (false, "叛乱家族都与统治者同属宫廷，无法发动内战。") }
        Wars.reconcileLosses(r)
        afterGlobalOrder()
        return (true, r.chronicle.entries.asArray.last?.text.optionalString ?? "内战爆发。")
    }
}
