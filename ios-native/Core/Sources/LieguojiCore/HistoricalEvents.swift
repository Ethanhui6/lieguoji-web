import Foundation

/// v8.0.0 真实历史事件链引擎与「史实路线 / 架空路线」控制系统：
/// - 玩家开启历史剧本时可自由选择：
///   1. `historical`（史实路线）：严格按历史年月推进重大事件（德奥合并、慕尼黑协定、九一八事变、七七事变、
///      白色方案闪击波兰、苏德密约瓜分波兰、黄色方案绕道低地三国、维希停战、巴巴罗萨、偷袭珍珠港、八月风暴等），
///      AI 100% 遵循史实分支并锁死历史同盟阵营，绝不无故退盟背刺；
///   2. `sandbox`（架空路线）：历史事件依旧按期触发，但玩家与 AI 均可自由选择历史分歧支线（如奥地利拒并、
///      东北军死战、波兰割让但泽、日本北进苏联、法国死守本土等），演义全新架空世界线！
/// - 每一条事件均具备真实引擎层实效（领土吞并、割地瓜分、成立附庸、强制宣战、锁盟参战、战役闪电战 Buff、
///   全球紧张度与工业产能剧变），并推送图文并茂的历史事件报刊弹窗供玩家实时批阅或抉择。
public enum HistoricalEvents {

    public struct Choice: Codable, Equatable, Sendable {
        public let title: String
        public let subtitle: String
        public let isHistorical: Bool
        public let effectCode: String

        public init(title: String, subtitle: String, isHistorical: Bool, effectCode: String) {
            self.title = title
            self.subtitle = subtitle
            self.isHistorical = isHistorical
            self.effectCode = effectCode
        }
    }

    public struct EventSpec: Sendable {
        public let id: String
        public let scenarioIds: Set<String>
        /// 触发所需游戏日下限（或目标年份+月份）
        public let triggerYear: Int
        public let triggerMonth: Int
        public let minDay: Int
        public let title: String
        public let headline: String
        public let dateLabel: String
        public let body: String
        public let effectSummary: String
        /// 对应 `EventScrolls/<illustration>.png` 卷轴插图键名
        public let illustration: String
        /// 主导决策国家（HistoricalNationSpec.id）
        public let actorSpecId: String
        public let targetSpecId: String?
        public let choices: [Choice]
        // MARK: v14.0.0 钢铁雄心级局势前置条件（全部默认 nil，保持目录定义向后兼容）
        /// 必须已触发过某前置历史事件
        public let requiresEvent: String?
        /// 若某事件已触发则本事件不再触发（互斥分支）
        public let forbidsEvent: String?
        /// 要求指定双方当前正处于交战状态
        public let requireAtWar: (String, String)?
        /// 要求指定双方当前处于和平状态
        public let requireAtPeace: (String, String)?
        /// 要求主导方相对目标方的综合国力比 ≥ 该值（防止弱国凭空吞并/胁迫强国）
        public let minPowerRatio: Double?
        /// 要求目标方当前实控州占初始领土比例 ≤ 该值（如维希停战/罗马尼亚倒戈只在战局崩盘时触发！）
        public let maxTargetControlRatio: Double?

        public init(
            id: String,
            scenarioIds: Set<String>,
            triggerYear: Int,
            triggerMonth: Int,
            minDay: Int,
            title: String,
            headline: String,
            dateLabel: String,
            body: String,
            effectSummary: String,
            illustration: String,
            actorSpecId: String,
            targetSpecId: String?,
            choices: [Choice],
            requiresEvent: String? = nil,
            forbidsEvent: String? = nil,
            requireAtWar: (String, String)? = nil,
            requireAtPeace: (String, String)? = nil,
            minPowerRatio: Double? = nil,
            maxTargetControlRatio: Double? = nil
        ) {
            self.id = id; self.scenarioIds = scenarioIds
            self.triggerYear = triggerYear; self.triggerMonth = triggerMonth; self.minDay = minDay
            self.title = title; self.headline = headline; self.dateLabel = dateLabel
            self.body = body; self.effectSummary = effectSummary; self.illustration = illustration
            self.actorSpecId = actorSpecId; self.targetSpecId = targetSpecId; self.choices = choices
            self.requiresEvent = requiresEvent; self.forbidsEvent = forbidsEvent
            self.requireAtWar = requireAtWar; self.requireAtPeace = requireAtPeace
            self.minPowerRatio = minPowerRatio; self.maxTargetControlRatio = maxTargetControlRatio
        }
    }

    public struct PendingModal: Codable, Equatable, Sendable {
        public let id: String
        public let title: String
        public let headline: String
        public let dateLabel: String
        public let body: String
        public let effectSummary: String
        public let illustration: String
        public let isHistoricalRoute: Bool
        public let choices: [Choice]
        public var actorName: String? = nil
        public var actorColor: String? = nil
        public var targetName: String? = nil
        public var targetColor: String? = nil
        public var focusProvince: Int? = nil
        public var resolved: Bool? = nil
        public var appliedEffectCode: String? = nil
        // v14.0.0：双方实时军力/工业/疆域对比与已生效分支标题（供 HOI4 级事件报刊弹窗渲染）
        public var actorTroops: Int? = nil
        public var actorIC: Int? = nil
        public var actorProvinces: Int? = nil
        public var targetTroops: Int? = nil
        public var targetIC: Int? = nil
        public var targetProvinces: Int? = nil
        public var chosenTitle: String? = nil
    }

    // MARK: - 路线判定与初始化

    public static func isHistoricalRoute(_ r: JS) -> Bool {
        guard !r.regimes.isNull else { return false }
        guard !r.regimes.historicalScenarioId.isNull else { return false }
        let mode = r.regimes.historicalRoute.optionalString ?? "historical"
        return mode == "historical"
    }

    public static func routeLabel(_ r: JS) -> String {
        isHistoricalRoute(r) ? "史实路线" : "架空路线"
    }

    public static func initScenario(_ r: JS, scenario: HistoricalScenario, route: String, specIdToNationId: [String: String]) {
        Regimes.enable(r)
        let cleanRoute = (route == "sandbox") ? "sandbox" : "historical"
        r.regimes.historicalRoute = JS(cleanRoute)
        r.regimes.firedEvents = .object()
        r.regimes.pendingEvent = .null
        let mapObj = JS.object()
        let revObj = JS.object()
        for (specId, nid) in specIdToNationId {
            mapObj[specId] = JS(nid)
            revObj[nid] = JS(specId)
        }
        r.regimes.historicalSpecToNation = mapObj
        r.regimes.historicalSpecIds = revObj
        // v14.0.0：记录开局各国实控州基数，供维希停战/意大利停战/罗马尼亚倒戈等条件触发事件精确判断战损比例！
        let initCounts = JS.object()
        var provCountByNation = [String: Int]()
        for p in r.world.provinces.asArray {
            if let ctrl = p.controller.optionalString { provCountByNation[ctrl, default: 0] += 1 }
        }
        for (nid, cnt) in provCountByNation { initCounts[nid] = JS(cnt) }
        r.regimes.initialProvCounts = initCounts

        // 依据历史剧本为每个国家设定真实初始军事学说，并立即把史实名将挂编至主力军团
        let era = HistoricalEra.current(r)
        for spec in scenario.nations {
            guard let nid = specIdToNationId[spec.id] else { continue }
            let docId = MilitaryDoctrines.defaultDoctrine(scenarioId: scenario.id, specId: spec.id, culture: spec.culture, era: era)
            _ = MilitaryDoctrines.setDoctrine(r, nationId: nid, doctrineId: docId, announce: false)
        }
        MilitaryDoctrines.assignHistoricalCommanders(r)
    }

    public static func nationId(_ r: JS, specId: String) -> String? {
        guard !r.regimes.isNull, !r.regimes.historicalSpecToNation.isNull else { return nil }
        return r.regimes.historicalSpecToNation[specId].optionalString
    }

    // MARK: - 140+ 真实世界史重大历史事件库（覆盖全部 12 大官方剧本 · 详见 HistoricalEventsCatalog.swift）

    public static var allEvents: [EventSpec] { expandedEvents }

    // MARK: - 每日低开销检查（O(E) 极速扫描，零拖慢模拟帧）

    public static func tickDay(_ r: JS) {
        guard UnitKinds.enabled, !r.regimes.isNull, r.regimes.enabled.isTruthy else { return }
        guard let scId = r.regimes.historicalScenarioId.optionalString, !scId.isEmpty else { return }
        let curDay = r.world.day.optionalNumber.map(Int.init) ?? 0
        // 仅当存在「尚未拍板」的交互决策事件时暂缓下一条；已自动结算的历史号外满 6 日自动收起，绝不阻塞后续历史大事件与 64× 看海
        if !r.regimes.pendingEvent.isNull {
            if !r.regimes.pendingEvent.resolved.isTruthy {
                return
            }
            let firedDay = r.regimes.pendingEvent.firedDay.asInt
            if curDay - firedDay >= 6 {
                r.regimes.pendingEvent = .null
            }
        }
        let curYear = HistoricalEra.displayYear(r)
        let curMonth: Int = {
            if !r.life.isNull && !r.life.currentDate.isNull, let m = r.life.currentDate.month.optionalNumber, m.isFinite, m >= 1 {
                return Int(m)
            }
            if !r.world.date.isNull, let m = r.world.date.month.optionalNumber, m.isFinite, m >= 1 {
                return Int(m)
            }
            return max(1, min(12, (curDay % 365) / 30 + 1))
        }()
        let historical = isHistoricalRoute(r)
        if r.regimes.firedEvents.isNull { r.regimes.firedEvents = .object() }

        // 每 30 天顺手检查是否有新组建军团尚未挂编历史名将
        if curDay > 0 && curDay % 30 == 0 {
            MilitaryDoctrines.assignHistoricalCommanders(r)
        }

        let playerNationId = r.regimes.playerNationId.optionalString
        let interactiveSandbox = r.regimes.playerInteractiveEvents.isTruthy
        let scenarioStartYear = HistoricalScenarios.scenario(id: scId)?.year ?? curYear

        func nationControlRatio(_ nid: String) -> Double {
            let cur = r.world.provinces.asArray.reduce(0) { $0 + ($1.controller.optionalString == nid ? 1 : 0) }
            let initial = (!r.regimes.initialProvCounts.isNull ? r.regimes.initialProvCounts[nid].optionalNumber : nil).map { max(1.0, $0) } ?? max(1.0, Double(cur))
            return Double(cur) / initial
        }

        for ev in allEvents where ev.scenarioIds.contains(scId) {
            guard r.regimes.firedEvents[ev.id].isNull else { continue }
            // v14.0.0 彻底修复跨剧本月份绕过缺陷：
            // 仅当事件年份 == 本剧本开局年份且 minDay ≤ 45 时视为开局序幕事件；跨年后续事件（如 1936 剧本中的 1939 白色方案）严格校验 triggerMonth！
            let isOpeningEvent = (ev.minDay <= 45 && ev.triggerYear == scenarioStartYear)
            let dateReached = isOpeningEvent
                ? (curYear >= ev.triggerYear)
                : ((curYear > ev.triggerYear) || (curYear == ev.triggerYear && curMonth >= ev.triggerMonth))
            guard dateReached else { continue }
            guard curDay >= ev.minDay else { continue }
            guard let actorNid = nationId(r, specId: ev.actorSpecId), Vassals.alive(r, actorNid) else { continue }
            let targetNid = ev.targetSpecId.flatMap { nationId(r, specId: $0) }
            if ev.targetSpecId != nil {
                guard let tNid = targetNid, Vassals.alive(r, tNid) else { continue }
            }
            // v14.0.0 钢铁雄心级局势/国力/因果链前置校验（不再无视真实战局盲目触发！）
            if let reqEv = ev.requiresEvent, r.regimes.firedEvents[reqEv].isNull { continue }
            if let forbEv = ev.forbidsEvent, !r.regimes.firedEvents[forbEv].isNull { continue }
            if let (wa, wb) = ev.requireAtWar {
                guard let na = nationId(r, specId: wa), let nb = nationId(r, specId: wb),
                      Wars.relation(r, na, nb)?.status.asString == "war" else { continue }
            }
            if let (pa, pb) = ev.requireAtPeace {
                guard let na = nationId(r, specId: pa), let nb = nationId(r, specId: pb),
                      Wars.relation(r, na, nb)?.status.asString != "war" else { continue }
            }
            if let minRatio = ev.minPowerRatio, let tNid = targetNid {
                let ap = max(1.0, War26.compositePower(r, actorNid).total)
                let tp = max(1.0, War26.compositePower(r, tNid).total)
                guard ap / tp >= minRatio else { continue }
            }
            if let maxCtrl = ev.maxTargetControlRatio, let tNid = targetNid {
                guard nationControlRatio(tNid) <= maxCtrl else { continue }
            }

            // 标记触发
            r.regimes.firedEvents[ev.id] = JS(curDay)

            let involvesPlayer = (playerNationId != nil) && (playerNationId == actorNid || playerNationId == targetNid)

            // v14.0.0 玩家公平权：无论史实或架空路线，凡涉及玩家本国（主导或受害方）的多分支事件一律交由玩家亲手抉择，绝不静默吞并/割让玩家领土！
            if (involvesPlayer || (interactiveSandbox && !historical)) && ev.choices.count > 1 {
                storePendingModal(r, ev: ev, historical: historical)
                return
            }

            // 选择分支：史实路线遵循史实分支；架空路线 AI 按综合国力对比加权抉择（强国进取、弱国避战务实）！
            let pickedIndex: Int
            if historical || ev.choices.count <= 1 {
                pickedIndex = ev.choices.firstIndex(where: \.isHistorical) ?? 0
            } else {
                let seed = "\(r.world.custom.seed.optionalString ?? "")|\(ev.id)|\(curDay)"
                let roll = Int(Opening.hash(seed) % 100)
                var histWeight = 62
                if let tNid = targetNid {
                    let ratio = max(1.0, War26.compositePower(r, actorNid).total) / max(1.0, War26.compositePower(r, tNid).total)
                    if ratio < 0.75 { histWeight = 32 } // 主导方处于明显劣势时更倾向走和平/防御分歧
                    else if ratio > 1.65 { histWeight = 78 }
                }
                if roll < histWeight {
                    pickedIndex = ev.choices.firstIndex(where: \.isHistorical) ?? 0
                } else {
                    let alts = ev.choices.indices.filter { !ev.choices[$0].isHistorical }
                    pickedIndex = alts.isEmpty ? 0 : alts[roll % alts.count]
                }
            }
            let choice = ev.choices[pickedIndex]
            applyEffectCode(r, code: choice.effectCode, ev: ev, chosenTitle: choice.title)

            // 同时把事件报刊写入 pendingEvent 供客户端展示重大历史号外，若 6 日未点自动收起
            storePendingModal(r, ev: ev, historical: historical, resolvedChoiceIndex: pickedIndex)
            return
        }
    }

    private static func nationSummaryStats(_ r: JS, nid: String) -> (troops: Int, ic: Int, provinces: Int) {
        var troops = 0
        for a in r.world.armies.asArray where a.nationId.optionalString == nid && a.status.asString != "destroyed" {
            troops += max(0, a.troops.asInt)
        }
        let provs = r.world.provinces.asArray.reduce(0) { $0 + ($1.controller.optionalString == nid ? 1 : 0) }
        let icVal = Int(NuclearWarfare.ic(r, nationId: nid).rounded())
        return (troops, icVal, provs)
    }

    private static func storePendingModal(_ r: JS, ev: EventSpec, historical: Bool, resolvedChoiceIndex: Int? = nil) {
        let obj = JS.object()
        obj.id = JS(ev.id)
        obj.title = JS(ev.title)
        obj.headline = JS(ev.headline)
        obj.dateLabel = JS(ev.dateLabel)
        obj.body = JS(ev.body)
        obj.effectSummary = JS(ev.effectSummary)
        obj.illustration = JS(ev.illustration)
        obj.isHistoricalRoute = JS(historical)
        obj.firedDay = JS(r.world.day.optionalNumber.map(Int.init) ?? 0)
        // v12.0.0/v14.0.0：写入涉事国家双边信息、国色、实时军力/IC/疆域对比与事发州索引
        let nationsArr = r.world.nations.asArray
        let provsArr = r.world.provinces.asArray
        let actorNid = nationId(r, specId: ev.actorSpecId)
        let targetNid = ev.targetSpecId.flatMap { nationId(r, specId: $0) }
        if let actorNid, let an = nationsArr.first(where: { $0.id.optionalString == actorNid }) {
            obj.actorName = JS(an.name.optionalString ?? Vassals.name(r, actorNid))
            obj.actorColor = JS(an.color.optionalString ?? "#B84A39")
            let st = nationSummaryStats(r, nid: actorNid)
            obj.actorTroops = JS(st.troops); obj.actorIC = JS(st.ic); obj.actorProvinces = JS(st.provinces)
        }
        if let targetNid, let tn = nationsArr.first(where: { $0.id.optionalString == targetNid }) {
            obj.targetName = JS(tn.name.optionalString ?? Vassals.name(r, targetNid))
            obj.targetColor = JS(tn.color.optionalString ?? "#4A6B8A")
            let st = nationSummaryStats(r, nid: targetNid)
            obj.targetTroops = JS(st.troops); obj.targetIC = JS(st.ic); obj.targetProvinces = JS(st.provinces)
        }
        let focusNid = targetNid ?? actorNid
        if let focusNid, let capPid = Rebellion.capitalProvince(r, focusNid),
           let pIdx = provsArr.firstIndex(where: { $0.id.optionalString == capPid }) {
            obj.focusProvince = JS(pIdx)
        }
        if let idx = resolvedChoiceIndex {
            obj.resolved = JS(true)
            let c = ev.choices[idx]
            obj.appliedEffectCode = JS(c.effectCode)
            obj.chosenTitle = JS(c.title)
            let cObj = JS.object()
            cObj.title = JS(c.title)
            cObj.subtitle = JS(c.subtitle)
            cObj.isHistorical = JS(c.isHistorical)
            cObj.effectCode = JS("ack")
            obj.choices = .array([cObj])
        } else {
            obj.resolved = JS(false)
            obj.choices = .array(ev.choices.map { c in
                let cObj = JS.object()
                cObj.title = JS(c.title)
                cObj.subtitle = JS(c.subtitle)
                cObj.isHistorical = JS(c.isHistorical)
                cObj.effectCode = JS(c.effectCode)
                return cObj
            })
        }
        r.regimes.pendingEvent = obj
    }

    public static func pendingModal(_ r: JS) -> PendingModal? {
        guard !r.regimes.isNull, !r.regimes.pendingEvent.isNull else { return nil }
        let e = r.regimes.pendingEvent
        guard let id = e.id.optionalString, !id.isEmpty else { return nil }
        let choices: [Choice] = e.choices.isArray ? e.choices.asArray.map { c in
            Choice(
                title: c.title.optionalString ?? "知悉",
                subtitle: c.subtitle.optionalString ?? "",
                isHistorical: c.isHistorical.isTruthy,
                effectCode: c.effectCode.optionalString ?? "ack"
            )
        } : []
        var m = PendingModal(
            id: id,
            title: e.title.optionalString ?? "历史事件",
            headline: e.headline.optionalString ?? "",
            dateLabel: e.dateLabel.optionalString ?? "",
            body: e.body.optionalString ?? "",
            effectSummary: e.effectSummary.optionalString ?? "",
            illustration: e.illustration.optionalString ?? "",
            isHistoricalRoute: e.isHistoricalRoute.isTruthy,
            choices: choices
        )
        m.actorName = e.actorName.optionalString
        m.actorColor = e.actorColor.optionalString
        m.targetName = e.targetName.optionalString
        m.targetColor = e.targetColor.optionalString
        m.focusProvince = e.focusProvince.optionalNumber.map(Int.init)
        m.resolved = e.resolved.isTruthy
        m.appliedEffectCode = e.appliedEffectCode.optionalString
        m.actorTroops = e.actorTroops.optionalNumber.map(Int.init)
        m.actorIC = e.actorIC.optionalNumber.map(Int.init)
        m.actorProvinces = e.actorProvinces.optionalNumber.map(Int.init)
        m.targetTroops = e.targetTroops.optionalNumber.map(Int.init)
        m.targetIC = e.targetIC.optionalNumber.map(Int.init)
        m.targetProvinces = e.targetProvinces.optionalNumber.map(Int.init)
        m.chosenTitle = e.chosenTitle.optionalString
        return m
    }

    @discardableResult
    public static func resolveChoice(_ r: JS, eventId: String, choiceIndex: Int) -> (ok: Bool, reason: String) {
        guard !r.regimes.isNull, !r.regimes.pendingEvent.isNull else { return (true, "已关闭") }
        let cur = r.regimes.pendingEvent
        guard cur.id.optionalString == eventId || eventId.isEmpty else { return (false, "事件已过期") }
        let alreadyResolved = cur.resolved.isTruthy
        let choicesArr = cur.choices.isArray ? cur.choices.asArray : []
        let safeIdx = max(0, min(max(0, choicesArr.count - 1), choiceIndex))
        let code = choicesArr.isEmpty ? "ack" : (choicesArr[safeIdx].effectCode.optionalString ?? "ack")
        let title = choicesArr.isEmpty ? "知悉" : (choicesArr[safeIdx].title.optionalString ?? "知悉")
        r.regimes.pendingEvent = .null
        if !alreadyResolved && code != "ack", let ev = allEvents.first(where: { $0.id == (cur.id.optionalString ?? "") }) {
            applyEffectCode(r, code: code, ev: ev, chosenTitle: title)
        }
        return (true, "已批阅历史事件")
    }

    // MARK: - 真实引擎级效果执行器（吞并、割地、瓜分、附庸、锁盟、宣战、闪电战 Buff、核试）

    private static func applyEffectCode(_ r: JS, code: String, ev: EventSpec, chosenTitle: String) {
        let clauses = code.split(separator: "|").map(String.init)
        var involvedNations = [String]()
        if let a = nationId(r, specId: ev.actorSpecId) { involvedNations.append(a) }
        if let t = ev.targetSpecId.flatMap({ nationId(r, specId: $0) }), !involvedNations.contains(t) {
            involvedNations.append(t)
        }

        for clause in clauses {
            let parts = clause.split(separator: ":").map(String.init)
            guard let op = parts.first else { continue }
            switch op {
            case "annex":
                if parts.count >= 3,
                   let winner = nationId(r, specId: parts[1]),
                   let victim = nationId(r, specId: parts[2]),
                   winner != victim, Vassals.alive(r, winner), Vassals.alive(r, victim) {
                    // v14.0.0 公平国力守护：若吞并方综合国力远不如目标国（< 0.75×），降级为正面宣战，杜绝弱国凭脚本一键蒸发强国！
                    let wp = max(1.0, War26.compositePower(r, winner).total)
                    let vp = max(1.0, War26.compositePower(r, victim).total)
                    if wp / vp >= 0.75 {
                        annexNation(r, winner: winner, victim: victim)
                    } else {
                        forceHistoricalWar(r, attacker: winner, defender: victim, callAllies: false, reason: ev.title)
                    }
                }
            case "cede", "cede_east":
                if parts.count >= 4,
                   let from = nationId(r, specId: parts[1]),
                   let to = nationId(r, specId: parts[2]),
                   let pct = Int(parts[3]),
                   from != to, Vassals.alive(r, from), Vassals.alive(r, to) {
                    // v14.0.0 公平割地守护：若双方交战且割地方正在大优（兵力 ≥ 对方 1.5× 且本土未丢超 10%），绝不无视战局强行割地！
                    let atWarNow = Wars.relation(r, from, to)?.status.asString == "war"
                    var skipUnfair = false
                    if atWarNow {
                        let fStats = nationSummaryStats(r, nid: from)
                        let tStats = nationSummaryStats(r, nid: to)
                        let initCnt = (!r.regimes.initialProvCounts.isNull ? r.regimes.initialProvCounts[from].optionalNumber : nil) ?? Double(max(1, fStats.provinces))
                        if Double(fStats.troops) >= Double(max(1, tStats.troops)) * 1.5 && Double(fStats.provinces) >= initCnt * 0.90 {
                            skipUnfair = true
                        }
                    }
                    if !skipUnfair {
                        cedeProvinces(r, from: from, to: to, percent: pct, preferEast: op == "cede_east")
                    }
                }
            case "puppet_split":
                // v14.0.0 维希停战式分区傀儡：puppet_split:victorSpec:victimSpec:cedePct
                if parts.count >= 4,
                   let victor = nationId(r, specId: parts[1]),
                   let victim = nationId(r, specId: parts[2]),
                   let pct = Int(parts[3]),
                   victor != victim, Vassals.alive(r, victor), Vassals.alive(r, victim) {
                    cedeProvinces(r, from: victim, to: victor, percent: max(15, min(65, pct)), preferEast: false)
                    forceHistoricalPeace(r, a: victor, b: victim)
                    makeHistoricalVassal(r, overlord: victor, vassal: victim, tributeRate: 0.22)
                }
            case "vassal":
                if parts.count >= 3,
                   let lord = nationId(r, specId: parts[1]),
                   let vas = nationId(r, specId: parts[2]),
                   lord != vas, Vassals.alive(r, lord), Vassals.alive(r, vas) {
                    makeHistoricalVassal(r, overlord: lord, vassal: vas, tributeRate: 0.18)
                }
            case "war":
                if parts.count >= 3,
                   let atk = nationId(r, specId: parts[1]),
                   let def = nationId(r, specId: parts[2]),
                   atk != def, Vassals.alive(r, atk), Vassals.alive(r, def) {
                    let callAllies = parts.count >= 4 && parts[3] == "1"
                    forceHistoricalWar(r, attacker: atk, defender: def, callAllies: callAllies, reason: ev.title)
                }
            case "peace":
                if parts.count >= 3,
                   let a = nationId(r, specId: parts[1]),
                   let b = nationId(r, specId: parts[2]) {
                    forceHistoricalPeace(r, a: a, b: b)
                }
            case "pact":
                if parts.count >= 4,
                   let a = nationId(r, specId: parts[1]),
                   let b = nationId(r, specId: parts[2]),
                   let yrs = Int(parts[3]) {
                    DiplomacyDeep.upsertTreaty(r, a: a, b: b, kind: "pact", years: yrs)
                }
            case "ally":
                if parts.count >= 3,
                   let a = nationId(r, specId: parts[1]),
                   let b = nationId(r, specId: parts[2]),
                   a != b, Vassals.alive(r, a), Vassals.alive(r, b) {
                    joinOrCreateHistoricalAlliance(r, leader: a, joiner: b, locked: isHistoricalRoute(r))
                }
            case "buff":
                // buff:specId:label:atk:def:spd:nav:days
                if parts.count >= 8, let nid = nationId(r, specId: parts[1]) {
                    MilitaryDoctrines.grantCampaignBuff(
                        r,
                        nationId: nid,
                        label: parts[2],
                        attackPct: Double(parts[3]) ?? 0,
                        defensePct: Double(parts[4]) ?? 0,
                        speedMult: Double(parts[5]) ?? 1.0,
                        navalPct: Double(parts[6]) ?? 0,
                        durationDays: Int(parts[7]) ?? 120
                    )
                }
            case "ic":
                // v14.0.0：改用 NuclearWarfare.addEventIC 写入永久 eventICBonus，绝不再被月度平滑侵蚀归零！
                if parts.count >= 3, let nid = nationId(r, specId: parts[1]), let delta = Double(parts[2]) {
                    NuclearWarfare.addEventIC(r, nationId: nid, delta: delta)
                }
            case "tension":
                if parts.count >= 2, let delta = Double(parts[1]) {
                    NuclearWarfare.ensureInitialized(r)
                    if !r.regimes.hoi4.isNull {
                        let cur = r.regimes.hoi4.worldTension.optionalNumber ?? 0
                        r.regimes.hoi4.worldTension = JS(min(100.0, max(0.0, cur + delta)))
                    }
                }
            case "nuke":
                if parts.count >= 3, let nid = nationId(r, specId: parts[1]), let cnt = Int(parts[2]) {
                    NuclearWarfare.ensureInitialized(r)
                    if !r.regimes.hoi4.isNull && !r.regimes.hoi4.nations[nid].isNull {
                        let cur = r.regimes.hoi4.nations[nid].nukes.asInt
                        r.regimes.hoi4.nations[nid].nukes = JS(cur + max(1, cnt))
                    }
                }
            case "gold":
                if parts.count >= 3, let nid = nationId(r, specId: parts[1]), let delta = Double(parts[2]) {
                    if !r.finance.isNull && !r.finance.nations.isNull && !r.finance.nations[nid].isNull {
                        let cur = r.finance.nations[nid].gold.optionalNumber ?? 0
                        r.finance.nations[nid].gold = JS(max(0.0, cur + delta))
                    }
                }
            case "gold_months":
                // v14.0.0 按月财政收入动态比例收支（支持正负数，公平适配大中小国与古今经济体量！）
                if parts.count >= 3, let nid = nationId(r, specId: parts[1]), let months = Double(parts[2]) {
                    if !r.finance.isNull && !r.finance.nations.isNull && !r.finance.nations[nid].isNull {
                        let gpm = max(45.0, abs(r.finance.nations[nid].goldPerMonth.optionalNumber ?? 60.0))
                        let cur = r.finance.nations[nid].gold.optionalNumber ?? 0
                        r.finance.nations[nid].gold = JS(max(0.0, cur + gpm * months))
                    }
                }
            case "lend_lease":
                // v14.0.0 真实有代价的租借物资：lend_lease:donorSpec:recipSpec:icDelta:goldMonths
                if parts.count >= 5,
                   let donor = nationId(r, specId: parts[1]),
                   let recip = nationId(r, specId: parts[2]),
                   let icD = Double(parts[3]),
                   let gm = Double(parts[4]),
                   Vassals.alive(r, donor), Vassals.alive(r, recip) {
                    if !r.finance.isNull && !r.finance.nations[donor].isNull {
                        let dgpm = max(45.0, abs(r.finance.nations[donor].goldPerMonth.optionalNumber ?? 60.0))
                        let dcur = r.finance.nations[donor].gold.optionalNumber ?? 0
                        r.finance.nations[donor].gold = JS(max(0.0, dcur - dgpm * max(0.5, gm * 0.6)))
                    }
                    if !r.finance.isNull && !r.finance.nations[recip].isNull {
                        let rgpm = max(55.0, abs(r.finance.nations[recip].goldPerMonth.optionalNumber ?? 70.0))
                        let rcur = r.finance.nations[recip].gold.optionalNumber ?? 0
                        r.finance.nations[recip].gold = JS(max(0.0, rcur + rgpm * gm))
                    }
                    NuclearWarfare.addEventIC(r, nationId: recip, delta: icD)
                }
            case "spawn_army":
                // v14.0.0 紧急成军/叛军起兵：spawn_army:specId:troops:label
                if parts.count >= 4, let nid = nationId(r, specId: parts[1]), let tr = Int(parts[2]), Vassals.alive(r, nid) {
                    spawnHistoricalArmy(r, nationId: nid, troops: max(1200, min(60000, tr)), customName: parts[3])
                }
            case "stability":
                if parts.count >= 3, let nid = nationId(r, specId: parts[1]), let delta = Double(parts[2]) {
                    if !r.destiny.isNull && !r.destiny.nations[nid].isNull {
                        let cur = r.destiny.nations[nid].destiny.optionalNumber ?? 50.0
                        r.destiny.nations[nid].destiny = JS(max(5.0, min(100.0, cur + delta)))
                    }
                }
            case "war_support":
                if parts.count >= 3, let nid = nationId(r, specId: parts[1]), let delta = Double(parts[2]) {
                    NuclearWarfare.adjustWarSupport(r, nationId: nid, delta: delta)
                }
            case "morale":
                if parts.count >= 3, let nid = nationId(r, specId: parts[1]), let delta = Double(parts[2]) {
                    for army in r.world.armies.asArray where army.nationId.optionalString == nid && army.troops.asNumber > 0 {
                        let cur = army.morale.optionalNumber ?? 65
                        army.morale = JS(max(15.0, min(100.0, cur + delta)))
                    }
                }
            case "law":
                if parts.count >= 3, let nid = nationId(r, specId: parts[1]) {
                    if let reform = Regimes.reforms.first(where: { $0.id == parts[2] }) {
                        Regimes.setReform(r, nid, reform, on: true)
                    }
                    // v14.0.0 修复：同步切换 NuclearWarfare 真实动员法案，杜绝法令与经济动员脱节！
                    NuclearWarfare.syncMobilizationFromReform(r, nationId: nid, reformId: parts[2])
                }
            default:
                break
            }
        }

        _ = People.announce(
            r,
            kind: "event",
            text: "【历史大事件】\(ev.title)（\(ev.dateLabel)）",
            reason: "\(ev.headline) — \(chosenTitle)。\(ev.effectSummary)",
            nations: involvedNations,
            province: nil
        )
    }

    private static func annexNation(_ r: JS, winner: String, victim: String) {
        forceHistoricalPeace(r, a: winner, b: victim)
        var annexedProvIds = Set<String>()
        for p in r.world.provinces.asArray where p.controller.optionalString == victim || p.legalOwner.optionalString == victim {
            p.controller = JS(winner)
            p.legalOwner = JS(winner)
            annexedProvIds.insert(p.id.asString)
        }
        // v11.0.0 同步迁移被吞并国全部城池并清除亡国首都标记
        for c in r.world.cities.asArray {
            if c.nationId.optionalString == victim || annexedProvIds.contains(c.provinceId.asString) {
                c.nationId = JS(winner)
                c.isCapital = JS(false)
            }
        }
        // 清理亡国现役陆军及其全部子账本（位置/速度/编制/自主AI）
        if r.world.armies.isArray {
            var deadIds = [String]()
            var kept = [JS]()
            for a in r.world.armies.asArray {
                if a.nationId.optionalString == victim { deadIds.append(a.id.asString) }
                else { kept.append(a) }
            }
            r.world.armies = .array(kept)
            for aid in deadIds {
                if !r.armyPositions.isNull && !r.armyPositions.records.isNull { r.armyPositions.records.delete(aid) }
                if !r.tactics.isNull && !r.tactics.forces.isNull { r.tactics.forces.delete(aid) }
                if !r.forceSpeed.isNull && !r.forceSpeed.armies.isNull { r.forceSpeed.armies.delete(aid) }
                if !r.armyAutonomy.isNull && !r.armyAutonomy.armies.isNull { r.armyAutonomy.armies.delete(aid) }
            }
        }
        // v11.0.0 修复舰队真实路径 r.navy.fleets（此前误写 r.world.fleets 致亡国幽灵舰队永久残留）
        if !r.navy.isNull && !r.navy.fleets.isNull && r.navy.fleets.isArray {
            var deadFleets = [String]()
            var keptFleets = [JS]()
            for fl in r.navy.fleets.asArray {
                if fl.nationId.optionalString == victim { deadFleets.append(fl.id.asString) }
                else { keptFleets.append(fl) }
            }
            r.navy.fleets = .array(keptFleets)
            for fid in deadFleets {
                if !r.fleetPositions.isNull && !r.fleetPositions.records.isNull { r.fleetPositions.records.delete(fid) }
                if !r.maritime.isNull && !r.maritime.hulls.isNull { r.maritime.hulls.delete(fid) }
            }
        }
        if !r.occupation.isNull && !r.occupation.sieges.isNull {
            let keptSieges = r.occupation.sieges.asArray.filter {
                $0.attacker.optionalString != victim && $0.controller.optionalString != victim && !annexedProvIds.contains($0.provinceId.asString)
            }
            r.occupation.sieges = .array(keptSieges)
        }
        War26.reconcileForces(r, [])
        if Naval.sea != nil { Naval.reconcileLandOwners(r) }
        Vassals.reconcileAlliances(r)
        DiplomacyBridge.reconcile(r)
    }

    private static func cedeProvinces(_ r: JS, from: String, to: String, percent: Int, preferEast: Bool) {
        let held = r.world.provinces.asArray.filter { $0.controller.optionalString == from }
        guard held.count >= 2 else { return }
        let capId = r.world.nations.asArray.first(where: { $0.id.asString == from })?.capitalId.optionalString
        let capProvId = capId.flatMap { cid in r.world.cities.asArray.first(where: { $0.id.asString == cid })?.provinceId.optionalString }
        let targetCount = max(1, min(held.count - 1, Int((Double(held.count) * Double(percent) / 100.0).rounded())))

        let toProvs = r.world.provinces.asArray.filter { $0.controller.optionalString == to }
        let toCx = toProvs.isEmpty ? 0 : toProvs.reduce(0.0) { $0 + $1.center.x.asNumber } / Double(toProvs.count)
        let toCy = toProvs.isEmpty ? 0 : toProvs.reduce(0.0) { $0 + $1.center.y.asNumber } / Double(toProvs.count)

        let sorted = held.filter { $0.id.optionalString != capProvId }.sorted { a, b in
            if preferEast {
                return a.center.x.asNumber > b.center.x.asNumber
            }
            let da = hypot(a.center.x.asNumber - toCx, a.center.y.asNumber - toCy)
            let db = hypot(b.center.x.asNumber - toCx, b.center.y.asNumber - toCy)
            return da < db
        }
        var cededIds = Set<String>()
        for p in sorted.prefix(targetCount) {
            p.controller = JS(to)
            p.legalOwner = JS(to)
            cededIds.insert(p.id.asString)
        }
        // v11.0.0 割地同步更新城池归属、遣返滞留他国军队并更新港口归属
        if !cededIds.isEmpty {
            for c in r.world.cities.asArray where cededIds.contains(c.provinceId.asString) {
                c.nationId = JS(to)
                c.isCapital = JS(false)
            }
            War26.reconcileForces(r, [])
            if Naval.sea != nil { Naval.reconcileLandOwners(r) }
            DiplomacyBridge.reconcile(r)
        }
    }

    private static func makeHistoricalVassal(_ r: JS, overlord lordId: String, vassal vassalId: String, tributeRate: Double) {
        guard lordId != vassalId, Vassals.overlord(r, vassalId) == nil else { return }
        if r.vassals.isNull {
            let v = JS.object()
            v.version = JS(1); v.revision = JS(0); v.enabled = JS(true)
            v.originTime = r.life.gameTime.clone(); v.originTick = r.clock.tick.clone()
            v.records = .array()
            r.vassals = v
        }
        let rec = JS.object()
        rec.overlordId = JS(lordId)
        rec.vassalId = JS(vassalId)
        rec.tributeRate = JS(max(0.05, min(0.35, tributeRate)))
        rec.time = JS(Native.fr(r.life.gameTime.asNumber))
        rec.tick = r.clock.tick.clone()
        rec.updateDay = JS(1)
        rec.endedTick = .null
        rec.endReason = .null
        r.vassals.records.push(rec)
        Vassals.bump(r.vassals)
        DiplomacyDeep.adjustOpinionMod(r, lordId, vassalId, delta: 25)
    }

    private static func spawnHistoricalArmy(_ r: JS, nationId nid: String, troops: Int, customName: String) {
        let capPid = Rebellion.capitalProvince(r, nid)
            ?? r.world.provinces.asArray.first(where: { $0.controller.optionalString == nid })?.id.asString
        guard let home = capPid else { return }
        let beforeCount = r.world.armies.length
        _ = Armies.create(r, nation: nid, home: home, kind: "emergency")
        if r.world.armies.length > beforeCount {
            let a = r.world.armies[r.world.armies.length - 1]
            let aid = a.id.asString
            a.troops = JS(troops)
            if !customName.isEmpty { a.name = JS(customName) }
            if !r.tactics.forces[aid].isNull {
                r.tactics.forces[aid].fullStrength = JS(troops)
            }
        }
    }

    private static func forceHistoricalWar(_ r: JS, attacker: String, defender: String, callAllies: Bool, reason: String) {
        if Wars.relation(r, attacker, defender)?.status.asString == "war" { return }
        DiplomacyDeep.breakTreatiesOnWar(r, attacker, defender)
        DiplomacyDeep.adjustOpinionMod(r, attacker, defender, delta: -60)
        // v14.0.0 修复：严格传递 callAllies 与 isOpening: false，彻底消灭苏联攻波兰误拖英法对苏开战 & 九一八一日全国同盟宣战缺陷！
        if let scId = r.regimes.historicalScenarioId.optionalString,
           let sc = HistoricalScenarios.scenario(id: scId),
           HistoricalScenarios.registerHistoricalWarDirectly(r, attacker: attacker, defender: defender, casusBelli: reason, scenario: sc, callAllies: callAllies, isOpening: false) {
            War26.reconcileForces(r, [])
            if Naval.sea != nil { Naval.reconcileLandOwners(r) }
            DiplomacyBridge.reconcile(r)
            return
        }
        if let rel = Wars.relation(r, attacker, defender) {
            rel.status = JS("war")
            rel.sinceDay = r.world.day.clone()
        } else {
            let rel = JS.object()
            rel.a = JS(attacker); rel.b = JS(defender); rel.status = JS("war"); rel.sinceDay = r.world.day.clone()
            r.world.statecraft.relations.push(rel)
        }
        if callAllies, let defAl = Vassals.allianceOf(r, defender) {
            for m in defAl.members.asArray.map(\.asString) where m != defender && m != attacker && Vassals.alive(r, m) {
                if Wars.relation(r, m, attacker)?.status.asString != "war" {
                    forceHistoricalWar(r, attacker: m, defender: attacker, callAllies: false, reason: "\(reason)·盟约参战")
                }
            }
        }
        DiplomacyBridge.reconcile(r)
    }

    private static func forceHistoricalPeace(_ r: JS, a: String, b: String) {
        if let rel = Wars.relation(r, a, b), rel.status.asString == "war" {
            rel.status = JS("peace")
            rel.sinceDay = r.world.day.clone()
            rel.truceUntilDay = JS(r.world.day.asInt + 30)
        }
        // v11.0.0 完整关闭双方涉事战役、围城与接触，杜绝停战次日幽灵交火！
        let sa = Wars.stateNumber(r, a), sb = Wars.stateNumber(r, b)
        if !r.nativeWars.isNull && !r.nativeWars.campaigns.isNull {
            for c in r.nativeWars.campaigns.asArray where c.endedTick.isNull {
                let parts = c.participants.asArray.map(\.stateId.asInt)
                if parts.contains(sa) && parts.contains(sb) && parts.count <= 2 {
                    c.endedTick = r.clock.tick.clone()
                    c.endReason = JS("historical-peace")
                }
            }
            Vassals.bump(r.nativeWars)
        }
        if !r.warfare.isNull && !r.warfare.campaigns.isNull {
            for c in r.warfare.campaigns.asArray where c.endedDay.isNull {
                let ca = c.attacker.optionalString ?? "", cb = c.defender.optionalString ?? ""
                if (ca == a && cb == b) || (ca == b && cb == a) {
                    c.endedDay = r.world.day.clone()
                }
            }
        }
        if !r.occupation.isNull && !r.occupation.sieges.isNull {
            let kept = r.occupation.sieges.asArray.filter { s in
                let att = s.attacker.optionalString ?? "", ctl = s.controller.optionalString ?? ""
                return !((att == a && ctl == b) || (att == b && ctl == a))
            }
            r.occupation.sieges = .array(kept)
        }
        War26.reconcileForces(r, [])
        DiplomacyBridge.reconcile(r)
    }

    private static func joinOrCreateHistoricalAlliance(_ r: JS, leader: String, joiner: String, locked: Bool) {
        guard leader != joiner else { return }
        // v11.0.0 入新盟前必须先退出旧同盟，杜绝一国同时横跨轴心/同盟两大敌对阵营！
        if let oldAl = Vassals.allianceOf(r, joiner) {
            if oldAl.members.asArray.contains(where: { $0.asString == leader }) {
                if locked { oldAl.unbreakable = JS(true) }
                return
            }
            let remaining = oldAl.members.asArray.filter { $0.asString != joiner }
            if remaining.count < 2 {
                oldAl.endedTick = r.clock.tick.clone()
            } else {
                oldAl.members = .array(remaining)
            }
            Vassals.bump(r.alliances)
        }
        if let al = Vassals.allianceOf(r, leader) {
            if !al.members.asArray.contains(where: { $0.asString == joiner }) {
                al.members.push(JS(joiner))
                if locked { al.unbreakable = JS(true) }
                Vassals.bump(r.alliances)
            }
            return
        }
        if r.alliances.isNull {
            let a = JS.object()
            a.version = JS(1); a.revision = JS(0); a.nextId = JS(1); a.enabled = JS(true)
            a.originTime = r.life.gameTime.clone(); a.originTick = r.clock.tick.clone()
            a.records = .array(); a.lastAction = .object()
            r.alliances = a
        }
        let nextId = r.alliances.nextId.asNumber
        r.alliances.nextId = JS(nextId + 1)
        let rec = JS.object()
        rec.id = JS(nextId)
        rec.name = JS("\(Vassals.name(r, leader))历史同盟")
        rec.founders = .array([JS(leader), JS(joiner)])
        rec.members = .array([JS(leader), JS(joiner)])
        rec.startedTime = r.life.gameTime.clone()
        rec.joinedTime = JS(-100)
        rec.startedTick = r.clock.tick.clone()
        rec.endedTick = .null
        rec.unbreakable = JS(locked)
        r.alliances.records.push(rec)
        Vassals.bump(r.alliances)
    }
}
