import Foundation

/// 跨海海运运力、运兵船队护航与截杀、港口封锁断粮、两栖抢滩登陆与舰炮支援及天时战力联动引擎。
/// 全部规则严格限制在 App 模式（`UnitKinds.enabled && r.regimes.enabled.isTruthy`），确保网页逐字节黄金测试 100% 不受影响。
public enum MaritimeWarfare {
    /// 五大水师战略指令（玩家与 AI 共享，决定舰队巡弋、护航、封锁、破交与归港修整行为）。
    public enum FleetMission: String, CaseIterable, Sendable {
        case patrol   = "patrol"    // 制海巡弋：搜歼敌舰，争夺制海权
        case escort   = "escort"    // 护航掩护：紧随运兵船队并提供两栖岸轰火力支援
        case blockade = "blockade"  // 封锁敌港：死锁敌港、阻断登船并掠夺敌海贸岁入
        case raid     = "raid"      // 破交袭扰：高速截杀无护航运兵船与敌商路
        case refit    = "refit"     // 归港修整：返航安全船坞加速修船补员满载海粮

        public var label: String {
            switch self {
            case .patrol:   return "制海巡弋"
            case .escort:   return "护航掩护"
            case .blockade: return "封锁敌港"
            case .raid:     return "破交袭扰"
            case .refit:    return "归港修整"
            }
        }
        public var note: String {
            switch self {
            case .patrol:   return "主动搜寻敌方主力舰队决战，海战火力 +10%"
            case .escort:   return "掩护友军运兵船（战损再减七成）并支援两栖抢滩岸轰"
            case .blockade: return "死锁敌国海港（封锁效率 +40%）并截夺敌方海上商税"
            case .raid:     return "高速袭扰敌跨海运兵船队（截杀伤害 +35%）与海上商路"
            case .refit:    return "返航本国安全船坞双倍加速修补舰体与补充水兵"
            }
        }
    }

    public struct FleetMeta: Sendable {
        public let mission: FleetMission
        public let heavy: Int
        public let light: Int
        public let gunboats: Int
        public let admiralName: String?
        public let admiralBonus: Int
        public let admiralSkill: SeaDominion.AdmiralSkill?
        public let xp: Int
        public var rank: Int { xp >= 120 ? 3 : xp >= 60 ? 2 : xp >= 25 ? 1 : 0 }
        public var total: Int { max(1, heavy + light + gunboats) }
        public var heavyShare: Double { Double(heavy) / Double(total) }
        public var lightShare: Double { Double(light) / Double(total) }
        public var gunboatShare: Double { Double(gunboats) / Double(total) }
    }

    /// 读取或自动初始化某支舰队的三舰种编制（主力战舰 / 巡弋快舰 / 封锁炮舰）、任务指令与提督配置。
    public static func fleetMeta(_ r: JS, fleet: JS) -> FleetMeta {
        let id = fleet.id.asString
        let ships = max(1, fleet.ships.asInt)
        if !r.regimes.isNull {
            if r.regimes.fleetMeta.isNull { r.regimes.fleetMeta = .object() }
            var rec = r.regimes.fleetMeta[id]
            if rec.isNull {
                let h = max(1, (ships + 1) / 3)
                let l = max(0, (ships - h + 1) / 2)
                let g = max(0, ships - h - l)
                rec = JS.object()
                rec.mission = JS("patrol")
                rec.heavy = JS(h)
                rec.light = JS(l)
                rec.gunboats = JS(g)
                rec.xp = JS(0)
                r.regimes.fleetMeta[id] = rec
            } else {
                // 若战船总数因战损或扩编变动，按比例平滑同步三舰种总和
                var h = max(0, rec.heavy.optionalNumber.map(Int.init) ?? 0)
                var l = max(0, rec.light.optionalNumber.map(Int.init) ?? 0)
                var g = max(0, rec.gunboats.optionalNumber.map(Int.init) ?? 0)
                if h + l + g != ships {
                    let cur = h + l + g
                    if cur <= 0 {
                        h = max(1, (ships + 1) / 3); l = max(0, (ships - h + 1) / 2); g = max(0, ships - h - l)
                    } else if ships > cur {
                        let add = ships - cur
                        h += add / 2; l += add - add / 2
                    } else {
                        var drop = cur - ships
                        let dg = min(g, drop); g -= dg; drop -= dg
                        let dl = min(l, drop); l -= dl; drop -= dl
                        h = max(0, h - drop)
                        if h + l + g < ships { h += ships - (h + l + g) }
                    }
                    rec.heavy = JS(h); rec.light = JS(l); rec.gunboats = JS(g)
                }
            }
            let m = FleetMission(rawValue: rec.mission.optionalString ?? "patrol") ?? .patrol
            let h = max(0, rec.heavy.optionalNumber.map(Int.init) ?? ships)
            let l = max(0, rec.light.optionalNumber.map(Int.init) ?? 0)
            let g = max(0, rec.gunboats.optionalNumber.map(Int.init) ?? 0)
            let admName = rec.admiralName.optionalString
            let admBonus = rec.admiralBonus.optionalNumber.map(Int.init) ?? 0
            let admSkill = rec.admiralSkill.optionalString.flatMap(SeaDominion.AdmiralSkill.init(rawValue:))
            let xp = rec.xp.optionalNumber.map(Int.init) ?? 0
            return FleetMeta(mission: m, heavy: h, light: l, gunboats: g, admiralName: admName, admiralBonus: admBonus, admiralSkill: admSkill, xp: xp)
        }
        let h = max(1, (ships + 1) / 3), l = max(0, (ships - h + 1) / 2), g = max(0, ships - h - l)
        return FleetMeta(mission: .patrol, heavy: h, light: l, gunboats: g, admiralName: nil, admiralBonus: 0, admiralSkill: nil, xp: 0)
    }

    /// 舰队综合海战修正（供 Naval.combatInput 接入真实海战火力结算：含三舰种、勋阶、提督与特技及航海科技）。
    public static func navalCombatBonus(_ r: JS, nation: String) -> Double {
        guard UnitKinds.enabled, !r.regimes.isNull, r.regimes.enabled.isTruthy else { return 0 }
        let mine = Naval.fleets(r).filter { $0.nationId.optionalString == nation && $0.status.asString != "lost" && $0.ships.asInt > 0 }
        guard !mine.isEmpty else { return 0 }
        let navTech = Double(max(0, WorldDepth.techLevel(r, nation: nation, branch: .naval) - 1)) * 0.07
        var sum = 0.0
        for fl in mine {
            let meta = fleetMeta(r, fleet: fl)
            var b = meta.heavyShare * 0.16 + Double(meta.rank) * 0.06 + Double(meta.admiralBonus) / 100.0 + navTech
            if meta.mission == .patrol { b += 0.10 }
            if meta.admiralSkill == .fireAttack { b += 0.18 }
            else if meta.admiralSkill == .windGauge { b += 0.14 }
            sum += b
        }
        return sum / Double(mine.count)
    }

    /// 返回某国（及其同盟）当前可安全登船的未封锁港口所在行省索引集合。
    public static func unblockedFriendlyPortIndices(_ r: JS, nation: String) -> Set<Int> {
        guard !r.portControl.isNull, !r.portControl.ports.isNull else { return [] }
        var provIndex = [String: Int]()
        for (i, p) in r.world.provinces.asArray.enumerated() { provIndex[p.id.asString] = i }
        var out = Set<Int>()
        for (pid, pc) in r.portControl.ports.objectEntries {
            guard let idx = provIndex[pid] else { continue }
            let landOwner = pc.landOwnerId.optionalString ?? r.world.provinces[idx].controller.asString
            let occupier = pc.occupierId.optionalString ?? landOwner
            // 港口必须归本国或具备军事通行权的友邦控制，且当前未被敌对舰队占领/封锁
            guard RunWindow.access(r, nation, landOwner) else { continue }
            if occupier != landOwner && Wars.relation(r, nation, occupier)?.status.asString == "war" { continue }
            if isPortBlockaded(r, provinceId: pid, landOwner: landOwner) { continue }
            out.insert(idx)
        }
        return out
    }

    /// 判断港口是否正遭受敌国舰队占领或近海封锁。
    public static func isPortBlockaded(_ r: JS, provinceId: String, landOwner: String? = nil) -> Bool {
        guard !r.portControl.isNull, !r.portControl.ports.isNull else { return false }
        let pc = r.portControl.ports[provinceId]
        guard !pc.isNull else { return false }
        let owner = landOwner ?? pc.landOwnerId.optionalString ?? ""
        let occ = pc.occupierId.optionalString ?? owner
        if !owner.isEmpty && occ != owner && Wars.relation(r, owner, occ)?.status.asString == "war" { return true }
        if !r.regimes.isNull, !r.regimes.blockadedPorts.isNull, r.regimes.blockadedPorts[provinceId].isTruthy { return true }
        return false
    }

    /// 国家当前跨海海运运力上限（未封锁本国港口 × 2 + 活跃舰队总船数 ÷ 2 + 船坞政令加成）。
    /// 无未封锁海港时运力为 0（彻底杜绝无港陆军徒步踏海）。
    public static func seaTransportCapacity(_ r: JS, nation: String) -> Int {
        let ports = unblockedFriendlyPortIndices(r, nation: nation)
        guard !ports.isEmpty else { return 0 }
        let ships = Naval.fleets(r)
            .filter { $0.nationId.optionalString == nation && $0.status.asString != "lost" }
            .reduce(0) { $0 + max(0, $1.ships.asInt) }
        let bonus = (!r.regimes.isNull && !r.regimes.nations[nation].isNull)
            ? (r.regimes.nations[nation].seaTransportBonus.optionalNumber.map(Int.init) ?? 0) : 0
        let provinces = r.world.provinces.asArray
        let dockBonus = ports.reduce(0) { sum, idx in
            guard provinces.indices.contains(idx) else { return sum }
            return sum + max(0, SeaDominion.shipyardLevel(r, provinceId: provinces[idx].id.asString) - 1)
        }
        let techBonus = max(0, WorldDepth.techLevel(r, nation: nation, branch: .naval) - 1)
        return max(1, ports.count * 2 + ships / 2 + bonus + dockBonus + techBonus)
    }

    /// 统计该国当前已在海上航行或已排定渡海航程的陆军支数（可排除正在重下军令的军队本身）。
    public static func activeSeaTransports(_ r: JS, nation: String, excludingArmyId: String? = nil) -> Int {
        guard let bridge = Armies.bridge else { return 0 }
        let g = bridge.graph
        var count = 0
        for a in r.world.armies.asArray where a.nationId.optionalString == nation && a.troops.asNumber > 0 && a.status.asString != "destroyed" {
            let aid = a.id.asString
            if aid == excludingArmyId { continue }
            let rec = r.armyPositions.records[aid]
            guard !rec.isNull else { continue }
            let tr = bridge.travel(rec)
            guard !tr.nodes.isEmpty else { continue }
            let loc = g.location(tr)
            if g.provinces.indices.contains(loc.cell) && g.provinces[loc.cell] < 0 {
                count += 1
            } else if tr.status == .moving, tr.nodes.contains(where: { g.provinces.indices.contains($0) && g.provinces[$0] < 0 }) {
                count += 1
            }
        }
        return count
    }

    /// 判断某支陆军是否正获得近海友军战斗舰队的岸轰火力支援（两栖抢滩登陆减免罚值与破城加成）。
    public static func hasOffshoreNavalSupport(_ r: JS, nation: String, at point: (x: Double, y: Double)) -> Bool {
        guard let bridge = Armies.bridge, !r.navy.isNull, !r.navy.fleets.isNull else { return false }
        let g = bridge.graph
        for fl in r.navy.fleets.asArray where fl.status.asString != "lost" && fl.ships.asInt > 0 {
            let fn = fl.nationId.asString
            guard RunWindow.access(r, nation, fn) else { continue }
            let rec = r.fleetPositions.records[fl.id.asString]
            guard !rec.isNull else { continue }
            let fp = g.location(bridge.travel(rec)).point
            if jsHypot(fp.x - point.x, fp.y - point.y) <= 120 { return true }
        }
        return false
    }

    /// 每日海战、运兵船队护航与截杀、近海港口封锁、两栖抢滩状态更新与天时战损结算。
    public static func dailyTick(_ r: JS) {
        guard UnitKinds.enabled, !r.regimes.isNull, r.regimes.enabled.isTruthy else { return }
        guard let bridge = Armies.bridge else { return }
        let g = bridge.graph
        let space = Armies.space(r)

        if r.regimes.wasAtSea.isNull { r.regimes.wasAtSea = .object() }
        if r.regimes.landingDays.isNull { r.regimes.landingDays = .object() }
        if r.regimes.seaSupplyCut.isNull { r.regimes.seaSupplyCut = .object() }
        r.regimes.escortingFleets = .object()
        r.regimes.blockadingFleets = .object()
        r.regimes.blockadedPorts = .object()

        // 1. 收集所有活跃舰队实时坐标与三舰种/指令档案，并执行安全港船坞日常抢修与补员
        struct LiveFleet { let js: JS; let id: String; let nation: String; let x: Double; let y: Double; let ships: Int; let meta: FleetMeta }
        var liveFleets = [LiveFleet]()
        r.regimes.repairingFleets = .object()
        let day = r.world.day.asInt
        if !r.navy.isNull, !r.navy.fleets.isNull {
            for fl in r.navy.fleets.asArray where fl.status.asString != "lost" && fl.ships.asInt > 0 {
                let fid = fl.id.asString
                let rec = r.fleetPositions.records[fid]
                guard !rec.isNull else { continue }
                let loc = g.location(bridge.travel(rec))
                let pt = loc.point
                let meta = fleetMeta(r, fleet: fl)
                liveFleets.append(LiveFleet(js: fl, id: fid, nation: fl.nationId.asString, x: pt.x, y: pt.y, ships: fl.ships.asInt, meta: meta))

                // 船坞实时修缮与水兵补员：停泊在本国未封锁港口时自动修复受损舰体（归港修整指令下双倍速）
                let st = rec.status.asString
                if (st == "arrived" || st == "halted"), let sea = Naval.sea,
                   let dockedPort = sea.ports.first(where: { jsHypot(pt.x - $0.center.x, pt.y - $0.center.y) <= 22 }),
                   let pc = r.portControl.isNull ? nil : r.portControl.ports[dockedPort.provinceId],
                   !pc.isNull, pc.landOwnerId.optionalString == fl.nationId.asString,
                   !isPortBlockaded(r, provinceId: dockedPort.provinceId, landOwner: fl.nationId.asString) {
                    let maxHull = Double(fl.ships.asInt) * 100.0
                    let curHull = r.maritime.hulls[fid].optionalNumber ?? maxHull
                    let maxCrew = fl.ships.asInt * 200
                    let curCrew = fl.crew.asInt
                    if curHull < maxHull - 0.5 || curCrew < maxCrew {
                        r.regimes.repairingFleets[fid] = JS(true)
                        let dockLvl = SeaDominion.shipyardLevel(r, provinceId: dockedPort.provinceId)
                        let dockSpeed = dockLvl >= 3 ? 1.70 : dockLvl == 2 ? 1.35 : 1.0
                        let rate = (meta.mission == .refit ? 0.065 : 0.025) * dockSpeed
                        let nextHull = min(maxHull, curHull + maxHull * rate)
                        r.maritime.hulls[fid] = JS(nextHull)
                        if curCrew < maxCrew {
                            let addCrew = min(maxCrew - curCrew, Int((Double(meta.mission == .refit ? 24 : 10) * dockSpeed).rounded()))
                            fl.crew = JS(curCrew + addCrew)
                        }
                    } else if meta.mission == .refit {
                        // 修缮满编后自动切回制海巡弋，避免舰队永远停在船坞发呆
                        r.regimes.fleetMeta[fid].mission = JS("patrol")
                    }
                }
            }
        }

        // 2. 判定近海港口封锁：敌对战斗舰队盘踞港口近海（封锁炮舰与铁链锁港特技显著增强封锁范围与战分压制）
        if let sea = Naval.sea, !r.portControl.isNull, !r.portControl.ports.isNull {
            for port in sea.ports {
                let pid = port.provinceId
                let pc = r.portControl.ports[pid]
                guard !pc.isNull, let owner = pc.landOwnerId.optionalString else { continue }
                let hostiles = liveFleets.filter {
                    let chainBoost = $0.meta.admiralSkill == .ironChain ? 1.30 : 1.0
                    let rad = (55.0 + $0.meta.gunboatShare * 26.0 + ($0.meta.mission == .blockade ? 12.0 : 0.0)) * chainBoost
                    return Wars.relation(r, owner, $0.nation)?.status.asString == "war" && jsHypot($0.x - port.center.x, $0.y - port.center.y) <= rad
                }
                let friendlies = liveFleets.filter { RunWindow.access(r, owner, $0.nation) && jsHypot($0.x - port.center.x, $0.y - port.center.y) <= 60 }
                let hPower = hostiles.reduce(0.0) { $0 + Double($1.ships) * (1.0 + 0.45 * $1.meta.gunboatShare + ($1.meta.mission == .blockade ? 0.30 : 0.0) + ($1.meta.admiralSkill == .ironChain ? 0.35 : 0.0)) }
                let fPower = friendlies.reduce(0.0) { $0 + Double($1.ships) * (1.0 + 0.25 * $1.meta.heavyShare) }
                if hPower > fPower && hPower > 0 {
                    r.regimes.blockadedPorts[pid] = JS(true)
                    for hf in hostiles {
                        r.regimes.blockadingFleets[hf.id] = JS(true)
                        // 每 10 日封锁敌港累积战功、截夺海贸关税，并持续压低敌方战意/国运（加速敌方求和）
                        if day % 10 == 0 {
                            let curXp = r.regimes.fleetMeta[hf.id].xp.optionalNumber ?? 0
                            r.regimes.fleetMeta[hf.id].xp = JS(curXp + 2)
                            let chainMult = hf.meta.admiralSkill == .ironChain ? 1.40 : 1.0
                            let spoil = (16.0 + Double(hf.ships) * 4.5) * (1.0 + 0.35 * hf.meta.gunboatShare) * chainMult
                            if let atkNat = r.world.nations.asArray.first(where: { $0.id.asString == hf.nation }),
                               let defNat = r.world.nations.asArray.first(where: { $0.id.asString == owner }) {
                                let taken = min(max(0, defNat.gold.asNumber * 0.03), spoil)
                                if taken >= 5 {
                                    defNat.gold = JS(max(0, defNat.gold.asNumber - taken))
                                    atkNat.gold = JS(atkNat.gold.asNumber + taken)
                                }
                                let defDest = r.destiny.nations[owner]
                                if !defDest.isNull {
                                    let pressure = 0.25 * chainMult
                                    defDest.destiny = JS(max(5, (defDest.destiny.optionalNumber ?? 50) - pressure))
                                }
                            }
                        }
                    }
                }
            }
        }

        // 3. 逐军更新登船、护航、敌舰海上截杀、两栖抢滩登陆与海外封锁断补、以及天时恶劣天气损耗
        var liveArmyIds = Set<String>()
        for v in space {
            let a = v.army
            let aid = a.id.asString
            guard a.troops.asNumber > 0 && a.status.asString != "destroyed" else { continue }
            liveArmyIds.insert(aid)
            let nation = a.nationId.asString
            let loc = g.location(bridge.travel(v.travel))
            let atSea = v.province == nil || (g.provinces.indices.contains(loc.cell) && g.provinces[loc.cell] < 0)
            let wasSea = r.regimes.wasAtSea[aid].isTruthy

            if atSea {
                r.regimes.wasAtSea[aid] = JS(true)
                r.regimes.landingDays.delete(aid)
                r.regimes.seaSupplyCut.delete(aid)

                // 友军战舰护航判定（巡弋快舰与护航指令大幅拓宽护航半径并压低运兵船伤亡）
                let escorts = liveFleets.filter {
                    let rad = 98.0 + $0.meta.lightShare * 34.0 + ($0.meta.mission == .escort ? 24.0 : 0.0)
                    return RunWindow.access(r, nation, $0.nation) && jsHypot($0.x - loc.point.x, $0.y - loc.point.y) <= rad
                }
                for ef in escorts { r.regimes.escortingFleets[ef.id] = JS(true) }

                // 敌国战斗舰队海上截杀运兵船队（破交袭扰指令与快舰占比显著放大截杀范围与杀伤）
                let interceptors = liveFleets.filter {
                    let rad = 86.0 + $0.meta.lightShare * 28.0 + ($0.meta.mission == .raid ? 22.0 : 0.0)
                    return Wars.relation(r, nation, $0.nation)?.status.asString == "war" && jsHypot($0.x - loc.point.x, $0.y - loc.point.y) <= rad
                }
                if let raider = interceptors.first {
                    let escorted = !escorts.isEmpty
                    let strongEscort = escorts.contains { $0.meta.mission == .escort || $0.meta.heavy >= 2 }
                    var lossRate = escorted ? (strongEscort ? 0.035 : 0.055) : 0.18
                    if raider.meta.mission == .raid { lossRate *= 1.35 }
                    if raider.meta.admiralSkill == .commerceRaider { lossRate *= 1.40 }
                    lossRate *= (1.0 + 0.25 * raider.meta.lightShare + Double(raider.meta.rank) * 0.06)
                    let curTroops = a.troops.asNumber
                    let lost = max(1.0, (curTroops * min(0.45, lossRate)).rounded())
                    let nextTroops = max(0.0, curTroops - lost)
                    a.troops = JS(nextTroops)
                    a.morale = JS(max(0, (a.morale.optionalNumber ?? 60) - (escorted ? 5 : 18)))
                    Wars.recordLoss(r, nation, "soldiers", Int(lost))
                    let curXp = r.regimes.fleetMeta[raider.id].xp.optionalNumber ?? 0
                    r.regimes.fleetMeta[raider.id].xp = JS(curXp + (nextTroops <= 0 ? 18 : 4))
                    // 若有护航战舰，护航舰队反击敌拦截舰队并累积战功
                    if escorted, !r.maritime.isNull, !r.maritime.hulls.isNull {
                        let curHull = r.maritime.hulls[raider.id].optionalNumber ?? 100
                        let counterDmg = strongEscort ? 18.0 : 12.0
                        r.maritime.hulls[raider.id] = JS(max(10, curHull - counterDmg))
                        for ef in escorts {
                            let ex = r.regimes.fleetMeta[ef.id].xp.optionalNumber ?? 0
                            r.regimes.fleetMeta[ef.id].xp = JS(ex + 3)
                        }
                    }
                    if nextTroops <= 0 {
                        a.status = JS("destroyed")
                        Daily.event(r, "war", "\(raider.js.name.asString)海上截沉\(a.name.asString)运兵船队",
                                    escorted ? "虽有友军战舰护航，运兵船队仍在激烈海战中倾覆。" : "无舰队护航的运兵船队遭敌水师截杀覆没于海上！")
                    } else if day % 3 == 0 {
                        Daily.event(r, "war", "\(raider.js.name.asString)在海上截击\(a.name.asString)运兵船队（折损 \(Int(lost)) 人）",
                                    escorted ? "己方护航舰队奋力掩护，将运兵船损失压减七成。" : "缺乏战舰护航，运兵船队在海上惨遭敌舰炮火轰击！")
                    }
                }
            } else {
                r.regimes.wasAtSea.delete(aid)
                // 刚从海上踏上敌控沿海州 → 进入 3 日两栖抢滩登陆战状态！
                if wasSea, let p = v.province {
                    let ctrl = p.controller.asString
                    if ctrl != nation && Wars.relation(r, nation, ctrl)?.status.asString == "war" {
                        r.regimes.landingDays[aid] = JS(3)
                        let hasFire = hasOffshoreNavalSupport(r, nation: nation, at: (loc.point.x, loc.point.y))
                        Daily.event(r, "war", "\(a.name.asString)于\(p.name.asString)发起两栖抢滩登陆",
                                    hasFire ? "近海友军舰队提供舰炮火力支援，大幅减轻抢滩登陆战损！" : "无舰队岸轰掩护，抢滩部队三日内承受两栖登陆减益。")
                    }
                } else if let rem = r.regimes.landingDays[aid].optionalNumber.map(Int.init), rem > 0 {
                    if rem <= 1 { r.regimes.landingDays.delete(aid) } else { r.regimes.landingDays[aid] = JS(rem - 1) }
                }

                // 港口全封锁导致的海外补给线切断（在敌国或海外孤立作战且本国海港全被封锁）
                if let p = v.province {
                    let blk = Naval.blockade(r, nation)
                    let overseas = p.controller.asString != nation && blk.ports > 0 && blk.held >= blk.ports
                    if overseas {
                        r.regimes.seaSupplyCut[aid] = JS(true)
                        a.supplies = JS(max(0, (a.supplies.optionalNumber ?? 50) - 8))
                        a.morale = JS(max(10, (a.morale.optionalNumber ?? 60) - 3))
                    } else {
                        r.regimes.seaSupplyCut.delete(aid)
                    }

                    // 天时天气联动：暴雪与大旱对滞留战区军队造成真实补给消耗
                    if let dis = Regimes.disasterAt(r, p.id.asString) {
                        if dis == "snow" {
                            a.supplies = JS(max(0, (a.supplies.optionalNumber ?? 50) - 3))
                        } else if dis == "drought" {
                            a.supplies = JS(max(0, (a.supplies.optionalNumber ?? 50) - 4))
                        }
                    }
                }
            }
        }

        // 清理已亡军队的残留键
        for k in r.regimes.wasAtSea.objectKeys where !liveArmyIds.contains(k) { r.regimes.wasAtSea.delete(k) }
        for k in r.regimes.landingDays.objectKeys where !liveArmyIds.contains(k) { r.regimes.landingDays.delete(k) }
        for k in r.regimes.seaSupplyCut.objectKeys where !liveArmyIds.contains(k) { r.regimes.seaSupplyCut.delete(k) }
    }
}
