import Foundation

/// 跨海海运运力、运兵船队护航与截杀、港口封锁断粮、两栖抢滩登陆与舰炮支援及天时战力联动引擎。
/// 全部规则严格限制在 App 模式（`UnitKinds.enabled && r.regimes.enabled.isTruthy`），确保网页逐字节黄金测试 100% 不受影响。
public enum MaritimeWarfare {
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
        return max(1, ports.count * 2 + ships / 2 + bonus)
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

        // 1. 收集所有活跃舰队实时坐标
        struct LiveFleet { let js: JS; let id: String; let nation: String; let x: Double; let y: Double; let ships: Int }
        var liveFleets = [LiveFleet]()
        if !r.navy.isNull, !r.navy.fleets.isNull {
            for fl in r.navy.fleets.asArray where fl.status.asString != "lost" && fl.ships.asInt > 0 {
                let fid = fl.id.asString
                let rec = r.fleetPositions.records[fid]
                guard !rec.isNull else { continue }
                let pt = g.location(bridge.travel(rec)).point
                liveFleets.append(LiveFleet(js: fl, id: fid, nation: fl.nationId.asString, x: pt.x, y: pt.y, ships: fl.ships.asInt))
            }
        }

        // 2. 判定近海港口封锁：敌对战斗舰队盘踞港口近海（且无更强己方舰队驱逐）则封锁港口
        if let sea = Naval.sea, !r.portControl.isNull, !r.portControl.ports.isNull {
            for port in sea.ports {
                let pid = port.provinceId
                let pc = r.portControl.ports[pid]
                guard !pc.isNull, let owner = pc.landOwnerId.optionalString else { continue }
                let hostiles = liveFleets.filter { Wars.relation(r, owner, $0.nation)?.status.asString == "war" && jsHypot($0.x - port.center.x, $0.y - port.center.y) <= 55 }
                let friendlies = liveFleets.filter { RunWindow.access(r, owner, $0.nation) && jsHypot($0.x - port.center.x, $0.y - port.center.y) <= 55 }
                let hShips = hostiles.reduce(0) { $0 + $1.ships }
                let fShips = friendlies.reduce(0) { $0 + $1.ships }
                if hShips > fShips && hShips > 0 {
                    r.regimes.blockadedPorts[pid] = JS(true)
                    for hf in hostiles { r.regimes.blockadingFleets[hf.id] = JS(true) }
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

                // 友军战舰护航判定
                let escorts = liveFleets.filter { RunWindow.access(r, nation, $0.nation) && jsHypot($0.x - loc.point.x, $0.y - loc.point.y) <= 98 }
                for ef in escorts { r.regimes.escortingFleets[ef.id] = JS(true) }

                // 敌国战斗舰队海上截杀运兵船队
                let interceptors = liveFleets.filter { Wars.relation(r, nation, $0.nation)?.status.asString == "war" && jsHypot($0.x - loc.point.x, $0.y - loc.point.y) <= 86 }
                if let raider = interceptors.first {
                    let escorted = !escorts.isEmpty
                    let lossRate = escorted ? 0.05 : 0.18
                    let curTroops = a.troops.asNumber
                    let lost = max(1.0, (curTroops * lossRate).rounded())
                    let nextTroops = max(0.0, curTroops - lost)
                    a.troops = JS(nextTroops)
                    a.morale = JS(max(0, (a.morale.optionalNumber ?? 60) - (escorted ? 5 : 18)))
                    Wars.recordLoss(r, nation, "soldiers", Int(lost))
                    // 若有护航战舰，护航舰队反击敌拦截舰队
                    if escorted, !r.maritime.isNull, !r.maritime.hulls.isNull {
                        let curHull = r.maritime.hulls[raider.id].optionalNumber ?? 100
                        r.maritime.hulls[raider.id] = JS(max(10, curHull - 12))
                    }
                    if nextTroops <= 0 {
                        a.status = JS("destroyed")
                        Daily.event(r, "war", "\(raider.js.name.asString)海上截沉\(a.name.asString)运兵船队",
                                    escorted ? "虽有友军战舰护航，运兵船队仍在激烈海战中倾覆。" : "无舰队护航的运兵船队遭敌水师截杀覆没于海上！")
                    } else if r.world.day.asInt % 3 == 0 {
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
