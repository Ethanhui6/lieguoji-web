import Foundation

/// Fleets on the run state: fleet commands (fleet-commands47), the autonomous naval orders
/// (civilization47-naval-ai issueAutonomousNavalOrders47 with the native naval-roles,
/// naval-deployment and port-occupation kernels), port land reconciliation and the port interval
/// (civilization47-ports), and the daily fleet rations (civilization47-upkeep settleFleetFood47).
public enum Naval {
    static let f = Native.fr
    static let scheduleTicks = 40

    // MARK: Sea facts (native-statics seaStatic)
    public struct Port { public let id: String, provinceId: String, node: Int, center: TravelPoint }
    public struct Sea {
        public let components: [Int]
        public let ports: [Port]
        public init(_ v: JS) {
            components = v.components.asArray.map(\.asInt)
            ports = v.ports.asArray.map { Port(id: $0[0].asString, provinceId: $0[1].asString, node: $0[2].asInt, center: TravelPoint(x: $0[3].asNumber, y: $0[4].asNumber)) }
        }
        func component(_ face: Int) -> Int { components.indices.contains(face) ? components[face] : -1 }
    }
    /// The running world's sea facts (nil for a world without them: no ports, no fleets).
    public static var sea: Sea?
    static var cellsCache: (key: String, value: [String: Set<Int>])?
    /// harborCells46 from the harbour layout of the run.
    static func harborCells(_ r: JS) -> [String: Set<Int>] {
        let sites = r.harbors.isNull ? [] : r.harbors.sites.asArray, key = sites.map(\.id.asString).joined(separator: "|") + "#\(sites.count)"
        if let c = cellsCache, c.key == key { return c.value }
        var out = [String: Set<Int>](); for s in sites { out[s.id.asString] = Set(s.cells.asArray.map(\.asInt)) }
        cellsCache = (key, out); return out
    }
    static func atWar(_ r: JS, _ a: String, _ b: String) -> Bool { RunWindow.atWar(r, a, b) }
    static func fleetKey(_ id: String) -> String { "[\"fleet\",\"\(id)\"]" }
    static func fleets(_ r: JS) -> [JS] { r.navy.isNull || r.navy.fleets.isNull ? [] : r.navy.fleets.asArray }

    // MARK: Presence (navalPresence47)
    struct Present { let fleet: JS; let point: TravelPoint; let cell: Int; let face: Int }
    struct Presence { let fleets: [Present]; let held: Set<String>; let cells: [String: Set<Int>]
        func atPort(_ id: String) -> [Present] { let c = cells[id] ?? []; return fleets.filter { c.contains($0.face) } }
    }
    static func presence(_ r: JS) -> Presence {
        let bridge = Armies.bridge!, g = bridge.graph
        // 本帧已算出的接触（同一世界状态）直接沿用，不再对全部部队重算一遍。
        // 这里只查询舰队是否接战：只取舰队、与舰队同处一区的部队和舰队原有接触的对方来算，
        // 舰队的接战结果与全量计算完全相同（曾每次对全部军队重算接触）。
        let all = bridge.forces(r)
        var held = Set<String>()
        if all.contains(where: { $0.kind == .fleet }) {
            let motion = ContactMotion(graph: g), rules = bridge.rules(r), old = bridge.contacts(r), p = motion.positions(all)
            let fleetKeys = Set(all.filter { $0.kind == .fleet }.map(\.key))
            let areas = Set(all.filter { $0.kind == .fleet }.map { motion.areaKey(p[$0.key]!.cell, rules) })
            var partners = Set<String>()
            for c in old where fleetKeys.contains(c.a) || fleetKeys.contains(c.b) { partners.insert(c.a); partners.insert(c.b) }
            let subset = all.filter { $0.kind == .fleet || partners.contains($0.key) || areas.contains(motion.areaKey(p[$0.key]!.cell, rules)) }
            held = motion.contacts(subset, old, rules, p).held.intersection(fleetKeys)
        }
        let list = fleets(r).filter { $0.status.asString != "lost" }.map { fl -> Present in
            let loc = g.location(bridge.travel(r.fleetPositions.records[fl.id.asString]))
            return Present(fleet: fl, point: loc.point, cell: loc.cell, face: Int(g.faces[loc.cell]))
        }
        return Presence(fleets: list, held: held, cells: harborCells(r))
    }
    static func landHolders(_ space: [Armies.Located], _ province: String) -> [JS] {
        space.filter { $0.province?.id.asString == province && $0.army.status.asString != "retreating" }.map(\.army)
    }

    // MARK: Native kernels (native-war/port-occupation, naval-roles, naval-deployment)
    static func portTarget(_ p: JS, _ actor: String, _ enemy: (String) -> Bool) -> Bool {
        p.occupierId.asString != actor && (p.landOwnerId.asString == actor ? enemy(p.occupierId.asString) : enemy(p.landOwnerId.asString))
    }
    static func portAttack(_ p: JS, _ actor: String, _ strength: Double, _ dt: Double, _ enemy: (String) -> Bool) -> Bool {
        let land = p.landOwnerId.asString, occ = p.occupierId.asString
        if actor == land && occ == actor { p.value = JS(min(100, f(p.value.asNumber + f(f(dt) * 2)))); return false }
        if !portTarget(p, actor, enemy) && occ != actor { return false }
        if actor != land && !enemy(land) { return false }
        let delta = f(f(f(f(min(1, max(0, f(strength)))) + f(0.6)) * 15) * f(dt))
        if occ == actor { p.value = JS(min(100, f(p.value.asNumber + delta))); return false }
        p.value = JS(f(p.value.asNumber - delta)); if p.value.asNumber > 0 { return false }
        p.occupierId = JS(actor); p.value = JS(10); return true
    }
    static func portRecovery(_ p: JS, _ landOwner: String, _ holderPresent: Bool, _ otherPresent: Bool, _ dt: Double) {
        if p.landOwnerId.asString != landOwner { p.landOwnerId = JS(landOwner); p.occupierId = JS(landOwner); p.value = JS(100); return }
        if p.occupierId.asString != landOwner {
            if holderPresent { p.value = JS(min(100, f(p.value.asNumber + f(dt)))) }
            else { p.value = JS(f(p.value.asNumber - f(f(dt) * 2))); if p.value.asNumber <= 0 { p.occupierId = JS(landOwner); p.value = JS(5) } }
        } else if !otherPresent { p.value = JS(min(100, f(p.value.asNumber + f(f(dt) * 2)))) }
    }
    static func attackCount(_ count: Int) -> Int {
        if count <= 0 { return 0 }
        if UnitKinds.enabled {
            // App 模式：3 支及以下舰队战时全数出击跨海制海护航；4 支以上至少派出 78% 主力决战、保留 1 支护卫母港
            if count <= 3 { return count }
            let share = max(0.78, Tuning.current.navyAttackShare)
            let n = max(3, min(count - 1, Int(f(f(Double(count)) * f(share)).rounded(.up))))
            return n
        }
        var n = max(0, min(count, Int(f(f(Double(count)) * f(0.35)).rounded(.up))))
        if count >= 2 { n = min(n, count - 1) }
        return max(1, n)
    }
    struct Candidate { let id: String; let ordinal: Int; let frontline: Bool; let strength: Double }
    static func attackFleets(_ c: [Candidate]) -> [String] {
        let sorted = c.enumerated().sorted { x, y in
            let a = x.element, b = y.element
            if a.frontline != b.frontline { return a.frontline }
            if a.strength != b.strength { return a.strength > b.strength }
            if a.ordinal != b.ordinal { return a.ordinal < b.ordinal }
            return x.offset < y.offset
        }.map(\.element)
        return Array(sorted.prefix(attackCount(c.count))).map(\.id)
    }
    struct IdleRow { let id: String; let present: Int; let assigned: Int; var weight = 0.0; var crowded = false }
    static func idleWeights(_ ports: [IdleRow], war: Bool, preferred: String?, current: String?, home: String?) -> [IdleRow] {
        let rows = ports.map { p -> IdleRow in
            let count = max(p.present, p.assigned); var w = f(1 / f(Double(count + 1)))
            if p.id == preferred { w = f(w * f(1.35)) }; if p.id == current { w = f(w * f(1.2)) }; if p.id == home { w = f(w * f(war ? 0.95 : 1.15)) }
            let crowded = count >= (war ? 3 : 2); if crowded { w = max(f(0.05), f(w * f(0.25))) }
            var q = p; q.weight = w; q.crowded = crowded; return q
        }
        let free = rows.filter { !$0.crowded }; return free.isEmpty ? rows : free
    }
    static func chooseIdle(_ rows: [IdleRow], _ draw: () -> Double) -> IdleRow? {
        if rows.isEmpty { return nil }
        var total = 0.0; for row in rows { total = f(total + max(0, row.weight)) }
        if total <= 0 { return rows[min(rows.count - 1, Int((draw() * Double(rows.count)).rounded(.down)))] }
        let pick = f(f(draw()) * total); var sum = 0.0
        for row in rows { sum = f(sum + max(0, row.weight)); if sum >= pick { return row } }
        return rows.last
    }
    static func idleDelay(_ war: Bool, _ draw: () -> Double) -> Double { let lo = war ? 12.0 : 18, hi = war ? 20.0 : 32; return f(lo + f(f(draw()) * (hi - lo))) }
    static func draw(_ s: JS) -> Double {
        var x = UInt32(s.rng.asNumber); x ^= x << 13; x ^= x >> 17; x ^= x << 5; s.rng = JS(Double(x)); return Double(x) / 4294967296
    }
    static func ration(_ crew: Int) -> Int { Int((Double(crew) * (1.0 / 30)).rounded(.up)) }
    static func speed(_ r: JS) -> Double { f(2.2) * ForceMotion.mapUnitsPerNativeUnit * r.forceClock.secondsPerTick.asNumber }

    // MARK: Volley input (civilization47-combat combatReader47 volley.navy)
    /// 读取国家的历史海军战力加成（来自 `r.regimes.historicalFleets[nation]` 或 `r.regimes.historicalPower[nation]`）。
    public static func historicalNavalBonus(_ r: JS, nation: String) -> Double {
        guard UnitKinds.enabled, !r.regimes.isNull, r.regimes.enabled.isTruthy else { return 0 }
        if !r.regimes.historicalFleets.isNull, let v = r.regimes.historicalFleets[nation].navalPowerBonus.optionalNumber, v.isFinite {
            return max(-0.30, min(0.85, v))
        }
        if !r.regimes.historicalPower.isNull, let v = r.regimes.historicalPower[nation].navalPowerBonus.optionalNumber, v.isFinite {
            return max(-0.30, min(0.85, v))
        }
        return 0
    }
    /// 两栖跨海登陆与渡海航速加成：航海科技 ≥ 4 阶的海洋强国获得 +40% 跨海登陆速度！
    public static func amphibiousSpeedFactor(_ r: JS, nation: String) -> Double {
        guard UnitKinds.enabled, !r.regimes.isNull, r.regimes.enabled.isTruthy else { return 1.0 }
        let navTech = WorldDepth.techLevel(r, nation: nation, branch: .naval)
        return navTech >= 4 ? 1.40 : 1.0
    }
    /// The fleet's national destiny, maritime livelihood, its living leader's naval modifier,
    /// historical naval power bonus, and naval tech advantage vs active naval enemies.
    static func combatInput(_ r: JS, _ nation: String) -> Volley.NavalInput {
        let id = r.people.nations[nation].leaderId
        var leader: Double?
        if !id.isNull, let p = People.person(r, id.asInt) {
            var sum = 0.0
            for name in (p.traits.isNull ? [] : p.traits.asArray.map(\.asString)) { sum = f(sum + f(Nobility.trait(name)?.navalCombatModifier.optionalNumber ?? 0)) }
            let doctrineBonus = MaritimeWarfare.navalCombatBonus(r, nation: nation)
            leader = f(sum + f(doctrineBonus))
        } else {
            let doctrineBonus = MaritimeWarfare.navalCombatBonus(r, nation: nation)
            if doctrineBonus > 0 { leader = f(doctrineBonus) }
        }
        var powerBonus = 0.0
        if UnitKinds.enabled, !r.regimes.isNull, r.regimes.enabled.isTruthy {
            let era = HistoricalEra.current(r)
            powerBonus += historicalNavalBonus(r, nation: nation)
            // 对比当前交战敌国的航海科技均差，赋予真实海上科技代差倍率（二战/现代航母舰炮雷达代差高达 0.35…2.50 倍）
            let myTech = WorldDepth.techLevel(r, nation: nation, branch: .naval)
            var enemyTechSum = 0.0, enemyCount = 0
            if !r.world.statecraft.isNull && !r.world.statecraft.relations.isNull {
                for rel in r.world.statecraft.relations.asArray where rel.status.optionalString == "war" {
                    let other: String? = (rel.a.optionalString == nation) ? rel.b.optionalString : (rel.b.optionalString == nation ? rel.a.optionalString : nil)
                    if let other {
                        enemyTechSum += Double(WorldDepth.techLevel(r, nation: other, branch: .naval))
                        enemyCount += 1
                    }
                }
            }
            if enemyCount > 0 {
                let avgEnemy = Int((enemyTechSum / Double(enemyCount)).rounded())
                let techMult = Volley.navalTechGapMultiplier(attackerTech: myTech, defenderTech: avgEnemy, era: era)
                powerBonus += (techMult - 1.0)
            }
            if era.isModernAirEra {
                // 二战/现代海战叠加密接航空与舰队航空兵制空加成（航母舰队对无空掩护舰船具压倒性优势）
                let air = NuclearWarfare.airPower(r, nationId: nation)
                if air >= 50.0 {
                    powerBonus += min(0.45, (air - 40.0) / 100.0 * 0.65)
                }
            }
        }
        return Volley.NavalInput(destiny: r.upperCombat.nations[nation].destiny.asNumber, maritime: r.economy.nations[nation].ethnic.optionalString == "Maritime", leader: leader, powerBonus: powerBonus)
    }

    // MARK: Naval Shore Bombardment (+18% coastal battle support)
    private static var shoreCache: (world: ObjectIdentifier, tick: Int, map: [String: Bool])?

    /// 判断 `attacker` 的友军舰队是否控制与当前对 `victim` 沿海激战州相邻的海域，从而提供 +18% 舰炮岸轰火力支援。
    public static func hasShoreBombardment(_ r: JS, attacker: String, against victim: String) -> Bool {
        guard UnitKinds.enabled, !r.regimes.isNull, r.regimes.enabled.isTruthy,
              let sea, let bridge = Armies.bridge, !r.navy.isNull, !r.navy.fleets.isNull else { return false }
        let tick = r.clock.tick.asInt
        let wid = ObjectIdentifier(r)
        let pairKey = "\(attacker)|\(victim)"
        if shoreCache?.world == wid && shoreCache?.tick == tick, let cached = shoreCache?.map[pairKey] {
            return cached
        }
        if shoreCache?.world != wid || shoreCache?.tick != tick {
            shoreCache = (wid, tick, [:])
        }
        let g = bridge.graph
        let provinces = r.world.provinces.asArray
        var portByPid = [String: Port]()
        for pt in sea.ports { portByPid[pt.provinceId] = pt }

        // 找出攻守双方正处于陆地交锋的沿海港口州
        var battlePorts = [Port]()
        var seenPids = Set<String>()
        for a in r.world.armies.asArray where a.troops.asNumber > 0 && a.status.optionalString == "fighting" {
            let nid = a.nationId.optionalString ?? ""
            guard nid == attacker || nid == victim else { continue }
            let rec = r.armyPositions.records[a.id.asString]
            guard !rec.isNull else { continue }
            let cell = g.location(bridge.travel(rec)).cell
            guard g.provinces.indices.contains(cell) else { continue }
            let q = Int(g.provinces[cell])
            guard q >= 0, provinces.indices.contains(q) else { continue }
            let pid = provinces[q].id.asString
            if let port = portByPid[pid], seenPids.insert(pid).inserted {
                battlePorts.append(port)
            }
        }
        guard !battlePorts.isEmpty else {
            shoreCache?.map[pairKey] = false
            return false
        }

        // 校验攻方（或友邦）主力舰队是否压制该沿海战区相邻海面
        var supported = false
        let liveFleets = r.navy.fleets.asArray.filter { $0.status.optionalString != "lost" && $0.ships.asInt > 0 }
        for port in battlePorts {
            let portComp = sea.component(port.node)
            var friendlyShips = 0
            var enemyShips = 0
            // 若港口已由己方舰队实控封锁，直接计入制海优势
            if !r.portControl.isNull, r.portControl.ports[port.provinceId].occupierId.optionalString == attacker {
                friendlyShips += 4
            }
            for fl in liveFleets {
                let fn = fl.nationId.asString
                let rec = r.fleetPositions.records[fl.id.asString]
                guard !rec.isNull else { continue }
                let loc = g.location(bridge.travel(rec))
                let face = g.faces.indices.contains(loc.cell) ? Int(g.faces[loc.cell]) : -1
                guard sea.component(face) == portComp else { continue }
                let dist = jsHypot(loc.point.x - port.center.x, loc.point.y - port.center.y)
                guard dist <= 155.0 else { continue }
                if fn == attacker || RunWindow.access(r, attacker, fn) {
                    friendlyShips += fl.ships.asInt
                } else if fn == victim || atWar(r, attacker, fn) {
                    enemyShips += fl.ships.asInt
                }
            }
            if friendlyShips > enemyShips && friendlyShips > 0 {
                supported = true
                break
            }
        }
        shoreCache?.map[pairKey] = supported
        return supported
    }

    // MARK: Historical Fleets Bootstrap (Royal Navy / IJN / US Navy / Wu & Song Fleets)

    private static func defaultHistoricalFleetProfile(nationName: String, culture: String, era: HistoricalEra) -> (names: [String], admirals: [String]) {
        if nationName.contains("英") || nationName.contains("不列颠") || culture == "english" {
            let names = ["皇家本土舰队", "地中海舰队", "大西洋舰队", "远东舰队", "印度洋舰队", "海峡舰队"]
            let adms: [String]
            switch era {
            case .ww2, .modern: adms = ["坎宁安", "托维", "萨默维尔", "庞德", "弗雷泽", "蒙巴顿"]
            case .ww1:          adms = ["杰利科", "贝蒂", "费舍尔", "斯特迪", "杰克逊", "凯斯"]
            default:            adms = ["纳尔逊", "德雷克", "豪勋爵", "柯林伍德", "罗德尼", "胡德"]
            }
            return (names, adms)
        }
        if nationName.contains("日") || nationName.contains("幕府") || culture == "japanese" {
            let names = ["联合舰队", "第一航空舰队", "第二舰队", "南遣舰队", "第三舰队", "镇守府警备舰队"]
            let adms: [String]
            switch era {
            case .ww2, .modern: adms = ["山本五十六", "南云忠一", "小泽治三郎", "栗田健男", "近藤信竹", "古贺峰一"]
            case .ww1:          adms = ["东乡平八郎", "秋山真之", "上村彦之丞", "加藤友三郎", "岛村速雄", "出羽重远"]
            default:            adms = ["九鬼嘉隆", "村上武吉", "藤堂高虎", "加藤嘉明", "胁坂安治", "长宗我部水军"]
            }
            return (names, adms)
        }
        if nationName.contains("美") || nationName.contains("合众国") {
            let names = ["太平洋舰队", "大西洋舰队", "第三舰队", "第五舰队", "第七舰队", "特混航母舰队"]
            let adms = (era == .ww2 || era == .modern)
                ? ["尼米兹", "哈尔西", "斯普鲁恩斯", "欧内斯特·金", "米彻尔", "金凯德"]
                : ["法拉格特", "杜威", "马汉", "辛姆斯", "琼斯", "佩里"]
            return (names, adms)
        }
        if nationName.contains("德") || nationName.contains("普鲁士") || culture == "german" {
            let names = era == .ww1 ? ["公海舰队", "波罗的海舰队", "远东巡洋舰队", "北海潜艇群"] : ["北海主力舰队", "大西洋潜艇舰队", "波罗的海舰队", "挪威舰队"]
            let adms = era == .ww1 ? ["舍尔", "希佩尔", "提尔皮茨", "施佩"] : ["雷德尔", "邓尼茨", "吕特晏斯", "马沙尔"]
            return (names, adms)
        }
        if nationName.contains("法") || culture == "french" {
            let names = ["布雷斯特舰队", "地中海舰队", "土伦主力舰队", "远东巡洋舰队"]
            let adms = era.isNuclearCapableEra ? ["达尔朗", "让苏尔", "阿布里亚尔", "穆塞利耶"] : ["维尔纳夫", "叙弗朗", "德·格拉斯", "图维尔"]
            return (names, adms)
        }
        if nationName.contains("意") || nationName.contains("威尼斯") || culture == "italian" {
            return (["皇家地中海舰队", "塔兰托主力舰队", "亚得里亚舰队"], ["亚基诺", "坎皮奥尼", "多里亚", "丹多洛"])
        }
        if nationName.contains("苏") || nationName.contains("俄") || culture == "slavic" {
            return (["波罗的海舰队", "黑海舰队", "北方舰队", "太平洋舰队"], ["库兹涅佐夫", "乌沙科夫", "纳希莫夫", "马卡罗夫"])
        }
        if culture == "chinese" || culture == "korean" {
            let names: [String]
            let adms: [String]
            if era == .antiquity || era == .medieval {
                names = ["江南主力水师", "楼船大舰队", "江海巡弋水师", "海防总兵水师"]
                adms = ["周瑜", "吕蒙", "韩世忠", "郑和", "戚继光", "俞大猷"]
            } else {
                names = ["北洋水师", "南洋水师", "东海舰队", "南海舰队"]
                adms = ["邓世昌", "丁汝昌", "萨镇冰", "陈绍宽", "郑成功", "施琅"]
            }
            return (names, adms)
        }
        return (["第一主力舰队", "第二巡洋舰队", "远洋特混舰队", "近海护航舰队"], ["海上统帅", "主力提督", "巡洋提督", "海防司令"])
    }

    /// 历史剧本开局海军强国舰队编成（皇家海军、联合舰队、美国太平洋/大西洋舰队、东吴/两宋水师等）：
    /// 读取 `r.regimes.historicalFleets[nid]` 与 `r.regimes.historicalPower[nid]`，在各国海港扩编/新建多支历史主力舰队并配属真实历史海军名将。
    /// 幂等：通过 `r.regimes.historicalFleetsSpawned` 保证每局只执行一次。
    public static func spawnHistoricalFleets(_ r: JS) {
        guard UnitKinds.enabled, !r.regimes.isNull, r.regimes.enabled.isTruthy,
              let sea, !r.navy.isNull, !r.fleetPositions.isNull, !r.maritime.isNull,
              !r.portControl.isNull, !r.navalAutonomy.isNull else { return }
        if r.regimes.historicalFleetsSpawned.isTruthy { return }
        let hasFleetTable = !r.regimes.historicalFleets.isNull
        let hasPowerTable = !r.regimes.historicalPower.isNull
        guard hasFleetTable || hasPowerTable else { return }

        r.regimes.historicalFleetsSpawned = JS(true)
        let era = HistoricalEra.current(r)

        var controllerById = [String: String]()
        for p in r.world.provinces.asArray { controllerById[p.id.asString] = p.controller.asString }
        var portsByNation = [String: [Port]]()
        for pt in sea.ports {
            if let ctrl = controllerById[pt.provinceId], !ctrl.isEmpty {
                portsByNation[ctrl, default: []].append(pt)
            }
        }
        let dockBook = Shipyards.book(r)
        if dockBook.levels.isNull { dockBook.levels = JS.object() }
        if r.regimes.fleetMeta.isNull { r.regimes.fleetMeta = JS.object() }

        for n in r.world.nations.asArray {
            let nid = n.id.asString
            guard Vassals.alive(r, nid), let myPorts = portsByNation[nid], !myPorts.isEmpty else { continue }
            let hf = hasFleetTable ? r.regimes.historicalFleets[nid] : .null
            let hp = hasPowerTable ? r.regimes.historicalPower[nid] : .null
            let targetFleets = max(0, min(10, Int((hf.fleetCount.optionalNumber ?? hp.fleetCount.optionalNumber ?? 0).rounded())))
            let shipsPerFleet = max(0, min(12, Int((hf.shipsPerFleet.optionalNumber ?? hp.shipsPerFleet.optionalNumber ?? 0).rounded())))
            let navBonus = max(0.0, hf.navalPowerBonus.optionalNumber ?? hp.navalPowerBonus.optionalNumber ?? 0.0)
            guard targetFleets > 0 || shipsPerFleet > 0 else { continue }

            let desiredShips = max(3, min(12, shipsPerFleet > 0 ? shipsPerFleet : 6))
            let desiredFleets = max(1, targetFleets)
            let culture = r.civilization.isNull ? "" : (r.civilization.nations[nid].cultureId.optionalString ?? "")
            let fallback = defaultHistoricalFleetProfile(nationName: n.name.asString, culture: culture, era: era)
            let customNames = hf.fleetNames.optionalArray?.compactMap(\.optionalString)
                ?? hp.fleetNames.optionalArray?.compactMap(\.optionalString)
                ?? fallback.names
            // 兼容 HistoricalRoster 写入的对象数组 `{name, bonus, skill}` 及纯字符串数组
            struct AdmiralSpec { let name: String; let bonus: Int?; let skill: String? }
            let parsedAdmirals: [AdmiralSpec] = {
                let rawArr = hf.admirals.optionalArray ?? hp.admirals.optionalArray ?? []
                var out = [AdmiralSpec]()
                for entry in rawArr {
                    if let s = entry.optionalString, !s.isEmpty {
                        out.append(AdmiralSpec(name: s, bonus: nil, skill: nil))
                    } else if let s = entry.name.optionalString, !s.isEmpty {
                        let b = entry.bonus.optionalNumber.map { Int($0.rounded()) }
                        let sk = entry.skill.optionalString
                        out.append(AdmiralSpec(name: s, bonus: b, skill: sk))
                    }
                }
                if out.isEmpty {
                    return fallback.admirals.map { AdmiralSpec(name: $0, bonus: nil, skill: nil) }
                }
                return out
            }()

            // 升级母港船坞等级，确保历史主力舰队停泊扩编上限匹配
            let dockTier = desiredShips >= 9 ? 3 : (desiredShips >= 6 ? 2 : 1)
            for pt in myPorts {
                let curTier = dockBook.levels[pt.provinceId].optionalNumber.map(Int.init) ?? 1
                if dockTier > curTier { dockBook.levels[pt.provinceId] = JS(dockTier) }
            }

            func splitShips(_ total: Int) -> (h: Int, l: Int, g: Int) {
                let h = max(1, Int((Double(total) * 0.45).rounded()))
                let l = max(1, Int((Double(total) * 0.35).rounded()))
                let g = max(0, total - h - l)
                return (h, l, g)
            }

            let skills = SeaDominion.AdmiralSkill.allCases
            func applyAdmiralAndMeta(fleetId fid: String, index idx: Int, totalShips: Int) {
                let split = splitShips(totalShips)
                let meta = r.regimes.fleetMeta[fid].isNull ? JS.object() : r.regimes.fleetMeta[fid]
                meta.mission = JS(idx % 3 == 2 ? "escort" : "patrol")
                meta.heavy = JS(split.h)
                meta.light = JS(split.l)
                meta.gunboats = JS(split.g)
                meta.xp = JS(max(meta.xp.asInt, navBonus >= 0.25 ? 65 : 30))
                if !parsedAdmirals.isEmpty {
                    let adm = parsedAdmirals[idx % parsedAdmirals.count]
                    meta.admiralName = JS(adm.name)
                    let defaultBonus = min(30, max(12, Int((14.0 + navBonus * 32.0).rounded())))
                    meta.admiralBonus = JS(adm.bonus ?? defaultBonus)
                    meta.admiralSkill = JS(adm.skill ?? skills[idx % skills.count].rawValue)
                }
                r.regimes.fleetMeta[fid] = meta
            }

            // 1. 升级该国现有舰队并赋予历史舰队番号与名将
            let existing = fleets(r).filter { $0.nationId.optionalString == nid && $0.status.asString != "lost" }
            var fleetCursor = 0
            for fl in existing {
                let fid = fl.id.asString
                let curShips = max(1, fl.ships.asInt)
                let finalShips = max(curShips, desiredShips)
                fl.ships = JS(finalShips)
                fl.crew = JS(finalShips * SeaDominion.crewPerShip)
                fl.food = JS(max(fl.food.asNumber, Double(finalShips * SeaDominion.foodPerShip)))
                r.maritime.hulls[fid] = JS(Double(finalShips * 100))
                if fleetCursor < customNames.count {
                    fl.name = JS(customNames[fleetCursor])
                }
                applyAdmiralAndMeta(fleetId: fid, index: fleetCursor, totalShips: finalShips)
                fleetCursor += 1
            }

            // 2. 补充新建其余历史主力舰队至目标支数
            let need = max(0, desiredFleets - existing.count)
            for k in 0..<need {
                let port = myPorts[(existing.count + k) % myPorts.count]
                let split = splitShips(desiredShips)
                let fname = fleetCursor < customNames.count ? customNames[fleetCursor] : nil
                if let fl = SeaDominion.launchNewFleet(r, nation: nid, port: port, heavy: split.h, light: split.l, gunboats: split.g, customName: fname) {
                    applyAdmiralAndMeta(fleetId: fl.id.asString, index: fleetCursor, totalShips: desiredShips)
                }
                fleetCursor += 1
            }
        }
        Shipyards.remember(r)
    }

    // MARK: Ports (civilization47-ports)
    static func revise(_ r: JS) { Vassals.bump(r.portControl) }
    /// reconcilePortLandOwnersOwned47.
    public static func reconcileLandOwners(_ r: JS) {
        guard let sea, !r.portControl.isNull else { return }
        for port in sea.ports {
            let p = r.portControl.ports[port.provinceId]
            guard !p.isNull, let land = r.world.provinces.asArray.first(where: { $0.id.asString == port.provinceId }) else { continue }
            if p.landOwnerId.asString != land.controller.asString {
                p.landOwnerId = land.controller.clone(); p.occupierId = land.controller.clone(); p.value = JS(100); revise(r)
            }
        }
    }
    /// The port interval of one motion segment from its start presence (settlePortInterval47).
    static func settlePorts(_ r: JS, _ view: Presence, retreating: [String: Double], hulls: [String: Double], from: Double, seconds: Double) {
        guard let sea, seconds > 0, !r.portControl.isNull else { return }
        let s = r.portControl, original = s.json
        for port in sea.ports {
            let p = s.ports[port.provinceId]; if p.isNull { continue }
            let present = view.atPort(port.id), land = p.landOwnerId.asString, occ = p.occupierId.asString
            portRecovery(p, land, present.contains { $0.fleet.nationId.asString == occ }, present.contains { $0.fleet.nationId.asString != land }, seconds)
        }
        for v in view.fleets {
            let fl = v.fleet, id = fl.id.asString, nation = fl.nationId.asString
            if view.held.contains(fleetKey(id)) || (retreating[id] ?? -.infinity) > from { continue }
            let hull = hulls[id] ?? 0
            for port in sea.ports where view.cells[port.id]?.contains(v.face) == true {
                let p = s.ports[port.provinceId], enemy = { (x: String) in atWar(r, nation, x) }
                if !portTarget(p, nation, enemy) || !portAttack(p, nation, hull / (fl.ships.asNumber * 100), seconds, enemy) { continue }
                let order = s.fleets[id]; order.forwardBaseId = JS(port.provinceId); order.targetId = .null
                let name = r.world.cities.asArray.first { $0.provinceId.asString == port.provinceId }?.name.asString ?? r.world.provinces.asArray.first { $0.id.asString == port.provinceId }!.name.asString
                let w = r.world, eid = w.nextEventId.asNumber, e = JS.object()
                e.id = JS(eid); e.day = w.day.clone(); e.kind = JS("system"); e.text = JS("\(fl.name.asString)控制\(name)海港"); e.reason = JS("舰队实际处于港湾内并完成争夺；仅海港控制变化，城市和陆地不随之吞并。")
                w.nextEventId = JS(eid + 1); w.events.push(e); if w.events.length > 160 { w.events.asArray = Array(w.events.asArray.suffix(160)) }
            }
        }
        if s.json != original { revise(r) }
    }
    /// The start state a motion segment's port interval reads.
    struct Segment { let view: Presence; let retreating: [String: Double]; let hulls: [String: Double] }
    static func segment(_ r: JS) -> Segment? {
        guard sea != nil, !fleets(r).isEmpty, Armies.bridge != nil else { return nil }
        var ret = [String: Double](), hulls = [String: Double]()
        if !r.maritime.retreating.isNull { for (k, v) in r.maritime.retreating.objectEntries { ret[k] = v.asNumber } }
        for (k, v) in r.maritime.hulls.objectEntries { hulls[k] = v.asNumber }
        return Segment(view: presence(r), retreating: ret, hulls: hulls)
    }

    // MARK: Fleet commands (fleet-commands47)
    enum Command { case halt; case sail(port: String) }
    struct Resolved { let fleet: JS; let travel: JS; let points: [TravelPoint]; let portId: String?; let name: String }
    static func remainingPoints(_ t: ArmyTravel, _ g: TravelGraph) -> [TravelPoint] {
        var points = [g.location(t).point]
        if t.status == .arrived || t.status == .halted { return points }
        func add(_ p: TravelPoint) { if points.last! != p { points.append(p) } }
        if let d = t.destination, t.nodes.count == 1 { add(d); return points }
        var s = t
        for leg in t.leg..<(t.nodes.count - 1) { s.leg = leg; guard let part = g.segment(s) else { break }; if leg != t.leg || !t.crossed { add(part.gate) }; add(part.end) }
        return points
    }
    static func resolve(_ r: JS, _ id: String, _ action: Command) -> Result<Resolved, ArmyOrders.Refused> {
        let bridge = Armies.bridge!, g = bridge.graph
        guard let fl = fleets(r).first(where: { $0.id.asString == id && $0.status.asString != "lost" }), fl.crew.asNumber > 0 else { return .failure(.init(reason: "舰队不存在或已经失去战斗力。")) }
        let held = ContactMotion(graph: g).contacts(bridge.forces(r), bridge.contacts(r), bridge.rules(r)).held
        if held.contains(fleetKey(id)) || (r.maritime.retreating[id].optionalNumber ?? -.infinity) > r.clock.tick.asNumber { return .failure(.init(reason: "舰队正在交锋或脱离战场，普通改令不能取消这段过程。")) }
        let record = r.fleetPositions.records[id], current = bridge.travel(record), at = g.location(current)
        switch action {
        case .halt:
            if current.status == .halted || current.status == .arrived { return .failure(.init(reason: "舰队已经停止航行。")) }
            let t = record.clone(); t.status = JS("halted")
            return .success(Resolved(fleet: fl, travel: t, points: [at.point], portId: nil, name: "当前位置"))
        case .sail(let portId):
            guard let port = sea?.ports.first(where: { $0.id == portId }) else { return .failure(.init(reason: "当前地图不存在这个海港。")) }
            let cellId = port.node * 2 + 1
            guard let cell = g.cell(id: cellId), g.isSea(cell) else { return .failure(.init(reason: "舰队目标必须位于真实海面。")) }
            let land = r.world.provinces.asArray.first { $0.id.asString == port.provinceId }!, nation = fl.nationId.asString
            if !RunWindow.access(r, nation, land.controller.asString) && !atWar(r, nation, land.controller.asString) { return .failure(.init(reason: "中立国家尚未授予港口通行权。")) }
            let destination = port.center
            if current.status == .moving && current.destination != nil && current.nodes.last == cell && current.destination == destination { return .failure(.init(reason: "舰队正在前往这个精确目标。")) }
            if (current.status == .arrived || current.status == .halted) && at.cell == cell && at.point == destination { return .failure(.init(reason: "舰队已经抵达这个位置。")) }
            guard let path = g.path(from: at.cell, to: cell, allowSea: true, canEnterProvince: { _ in false }) else { return .failure(.init(reason: "当前海域与目标之间没有相连的水路。")) }
            let t = JS.object()
            t.version = JS(2); t.armyId = JS(id); t.origin = ForceBridge.json(at.point); t.destination = ForceBridge.json(destination)
            t.nodes = .array(path.nodes.map { JS(Int(g.ids[$0])) }); t.leg = JS(0); t.offset = JS(0); t.crossed = JS(false)
            t.status = JS(path.nodes.count == 1 && jsHypot(at.point.x - destination.x, at.point.y - destination.y) == 0 ? "arrived" : "moving")
            let name = (r.world.cities.asArray.first { $0.provinceId.asString == port.provinceId }?.name.asString ?? land.name.asString) + "港"
            return .success(Resolved(fleet: fl, travel: t, points: remainingPoints(bridge.travel(t), g), portId: port.id, name: name))
        }
    }
    /// previewFleetCommand47: validity and actual route length.
    static func preview(_ r: JS, _ id: String, _ action: Command) -> (valid: Bool, distance: Double) {
        guard case .success(let v) = resolve(r, id, action) else { return (false, 0) }
        var d = 0.0; for i in 1..<max(1, v.points.count) { d = d + jsHypot(v.points[i].x - v.points[i - 1].x, v.points[i].y - v.points[i - 1].y) }
        return (true, d)
    }
    /// issueFleetOrderOwned47.
    @discardableResult
    static func issue(_ r: JS, _ id: String, _ action: Command, player: Bool = false) -> Bool {
        guard case .success(let v) = resolve(r, id, action) else { return false }
        r.fleetPositions.records[id] = v.travel; Vassals.bump(r.fleetPositions)
        let fl = v.fleet
        fl.route = .array(); fl.progress = JS(0); fl.dockId = .null; fl.targetId = v.portId.map { JS($0) } ?? .null
        fl.status = JS(v.travel.status.asString == "moving" ? "sailing" : "anchored")
        if player {
            if !r.voyages.manualFleets.asArray.contains(where: { $0.asString == id }) { r.voyages.manualFleets.push(JS(id)) }
            Vassals.bump(r.voyages)
        }
        var halt = false; if case .halt = action { halt = true }
        Daily.event(r, "order", "\(fl.name.asString)\(halt ? "停止航行" : "驶往" + v.name)", "军令从实际海面位置生效，抵达码头前不提前补粮；不依赖旧港口或城市锚点。")
        return true
    }

    // MARK: Autonomous orders (issueAutonomousNavalOrders47)
    public static func issueAutonomous(_ r: JS) {
        let s = r.navalAutonomy
        guard !s.isNull else { return }
        let now = r.clock.tick.asNumber
        if now == s.lastTick.asNumber { return }
        // App worlds: fleets take their orders three times a day, not at every frame (a fifth of a day's
        // work went on reading every port and fleet six times a day for orders that seldom change).
        if !r.regimes.isNull && r.regimes.enabled.isTruthy && now > s.lastTick.asNumber && now - s.lastTick.asNumber < 40 { return }
        guard let sea, Armies.bridge != nil, !fleets(r).isEmpty else { s.lastTick = JS(now); s.revision = JS(s.revision.asNumber + 1); return }
        let tN = Profile.mark()
        Profile.measure("n.reconcile") { reconcileLandOwners(r) }
        let view = Profile.measure("n.presence") { presence(r) }, space = Armies.space(r), portBefore = Profile.measure("n.json") { r.portControl.json }
        Profile.since("n.head", tN)
        var landById = [String: JS](), stockById = [String: JS](), portById = [String: Port]()
        for p in r.world.provinces.asArray where landById[p.id.asString] == nil { landById[p.id.asString] = p }
        for p in r.world.statecraft.provinces.asArray where stockById[p.provinceId.asString] == nil { stockById[p.provinceId.asString] = p }
        for p in sea.ports where portById[p.id] == nil { portById[p.id] = p }
        let nations = r.world.nations.asArray.map(\.id.asString)
        var wars = [String: Bool]()
        func war(_ id: String) -> Bool { if let v = wars[id] { return v }; let v = nations.contains { atWar(r, id, $0) }; wars[id] = v; return v }
        var byComponent = [Int: [Port]](), safeCache = [String: [Port]]()
        func candidatesIn(_ c: Int) -> [Port] { if let v = byComponent[c] { return v }; let v = sea.ports.filter { sea.component($0.node) == c }; byComponent[c] = v; return v }
        func safeIn(_ nation: String, _ c: Int, _ low: Bool) -> [Port] {
            let key = "\(nation)|\(c)|\(low)"; if let v = safeCache[key] { return v }
            let v = candidatesIn(c).filter { p in
                let land = landById[p.provinceId]!, stock = stockById[p.provinceId]!
                return land.controller.asString == nation && land.legalOwner.asString == nation && r.portControl.ports[p.provinceId].occupierId.asString == nation
                    && !landHolders(space, p.provinceId).contains { atWar(r, nation, $0.nationId.asString) } && (!low || stock.grain.asNumber > stock.population.asNumber * 10)
            }
            safeCache[key] = v; return v
        }
        let all = fleets(r)
        if now >= s.nextRoleTick.asNumber {
            var ids = [JS]()
            for n in nations where war(n) {
                let c = view.fleets.filter { $0.fleet.nationId.asString == n }.map { v -> Candidate in
                    let fl = v.fleet, fid = fl.id.asString
                    let home = s.fleets[fid].homePortId.optionalString.flatMap { portById[$0] }, p = home.flatMap { landById[$0.provinceId] }
                    let frontline = p.map { p in landHolders(space, p.id.asString).contains { atWar(r, n, $0.nationId.asString) } || p.neighbors.asArray.contains { atWar(r, n, landById[$0.asString]!.controller.asString) } } ?? false
                    return Candidate(id: fid, ordinal: all.firstIndex { $0.id.asString == fid }!, frontline: frontline, strength: f(r.maritime.hulls[fid].asNumber / (fl.ships.asNumber * 100)))
                }
                ids += attackFleets(c).map { JS($0) }
            }
            r.portControl.attackFleetIds = .array(ids)
            s.nextRoleTick = JS(now + Double(scheduleTicks))
        }
        let speed = speed(r)
        // 本作海防截击：记录各连通海域当前正在渡海的敌军坐标，供舰队主动出击封堵登陆航道。
        var seaArmiesByComp = [Int: [(nation: String, point: TravelPoint)]]()
        if UnitKinds.enabled, let bridge = Armies.bridge {
            let g = bridge.graph
            for v in space where v.province == nil && v.army.status.asString != "retreating" {
                guard g.faces.indices.contains(v.cell), !v.travel.isNull else { continue }
                let face = Int(g.faces[v.cell])
                let comp = sea.component(face)
                if comp >= 0 {
                    seaArmiesByComp[comp, default: []].append((v.army.nationId.asString, g.location(bridge.travel(v.travel)).point))
                }
            }
        }
        for fl in all {
            let id = fl.id.asString, nation = fl.nationId.asString, row = s.fleets[id], order = r.portControl.fleets[id]
            let enemy = { (x: String) in atWar(r, nation, x) }, atWarNow = war(nation), actual = view.fleets.first { $0.fleet.id.asString == id }
            func note(_ d: String, _ reason: String) { row.decision = JS(d); row.reason = JS(reason) }
            if let fb = order.forwardBaseId.optionalString, r.portControl.ports[fb].occupierId.optionalString != nation { order.forwardBaseId = .null }
            if let t = order.targetId.optionalString, r.portControl.ports[t].isNull || !portTarget(r.portControl.ports[t], nation, enemy) { order.targetId = .null }
            if order.lastWar.asBool && !atWarNow { order.active = JS(false); order.targetId = .null; order.forwardBaseId = .null; row.nextTick = JS(now) }
            order.lastWar = JS(atWarNow)
            guard let actual else { note("lost", "舰队已经损失，保留部署历史。"); row.assignedPortId = .null; order.active = JS(false); order.targetId = .null; continue }
            if r.voyages.manualFleets.asArray.contains(where: { $0.asString == id }) || !fl.patrol.asBool {
                row.assignedPortId = .null; order.active = JS(false); order.targetId = .null; note("manual", "保留玩家军令；恢复自主指挥后再重新评估。"); continue
            }
            if view.held.contains(fleetKey(id)) || (r.maritime.retreating[id].optionalNumber ?? -.infinity) > now { note("busy", "实际海战或撤离尚未结束，保留当前航向。"); continue }
            let moving = r.fleetPositions.records[id].status.asString == "moving", component = sea.component(actual.face)
            let appNaval = UnitKinds.enabled && !r.regimes.isNull && r.regimes.enabled.isTruthy
            let maxHull = max(100.0, fl.ships.asNumber * 100.0)
            let curHull = r.maritime.hulls[id].optionalNumber ?? maxHull
            if appNaval {
                let initMeta = MaritimeWarfare.fleetMeta(r, fleet: fl)
                if curHull < maxHull * 0.42 && initMeta.mission != .refit && !r.regimes.fleetMeta[id].playerMission.isTruthy {
                    r.regimes.fleetMeta[id].mission = JS("refit")
                }
            }
            let activeMission: MaritimeWarfare.FleetMission = appNaval ? MaritimeWarfare.fleetMeta(r, fleet: fl).mission : .patrol
            let foodLow = fl.food.asNumber < fl.crew.asNumber * (appNaval ? 18 : 30)
            let reserveFood = fl.crew.asNumber * (appNaval ? 12 : 30)
            let refitNeed = appNaval && activeMission == .refit
            let candidates = candidatesIn(component), low = foodLow || refitNeed, safe = safeIn(nation, component, foodLow)
            let assigned = row.assignedPortId.optionalString
            let goal = assigned.flatMap { a in candidates.first { $0.id == a } }
            let goalAttack = goal.map { g in order.targetId.optionalString == g.provinceId && portTarget(r.portControl.ports[g.provinceId], nation, enemy) } ?? false
            let goalHome = goal.map { g in safe.contains { $0.id == g.id } } ?? false
            if assigned != nil && !goalAttack && !goalHome || low && row.decision.asString != "resupply" { row.nextTick = JS(now) }
            if now < row.nextTick.asNumber { continue }
            row.nextTick = JS(now + Double(scheduleTicks))
            if moving && (goalHome || goalAttack && !low || assigned == nil && !low) { continue }
            if !moving && goalAttack && !low && view.atPort(goal!.id).contains(where: { $0.fleet.id.asString == id }) { note("attacking", "已在目标港湾，按实际存在时间争夺海港。"); continue }
            if moving { issue(r, id, .halt); row.assignedPortId = .null; order.targetId = .null }
            func atAnchor(_ p: Port) -> Bool { p.node == actual.face && jsHypot(actual.point.x - p.center.x, actual.point.y - p.center.y) <= 1e-8 }
            func start(_ pid: String, _ d: String, _ reason: String) { issue(r, id, .sail(port: pid)); row.assignedPortId = JS(pid); row.issuedTick = JS(now); note(d, reason) }
            let here = safe.first(where: atAnchor)
            if low, let here { row.assignedPortId = JS(here.id); order.targetId = .null; note("resupply", refitNeed ? "已泊入安全船坞，加速抢修舰体与补员。" : "实际停在安全本国锚点，等待日结从当地粮储补给。"); continue }
            let home = candidates.first { $0.id == row.homePortId.optionalString }
            let homeLost = home.map { r.portControl.ports[$0.provinceId].occupierId.asString != nation } ?? false
            let rationNow = Double(ration(fl.crew.asInt)), food = fl.food.asNumber
            func days(_ d: Double) -> Double { (d / speed / 120).rounded(.up) }
            let missionActive = appNaval && (activeMission == .blockade || activeMission == .raid || activeMission == .escort)
            if !low && atWarNow && (r.portControl.attackFleetIds.asArray.contains { $0.asString == id } || homeLost || goalAttack || missionActive || (UnitKinds.enabled && (seaArmiesByComp[component]?.contains { enemy($0.nation) } ?? false))) {
                func tryIntercept() -> Bool {
                    guard UnitKinds.enabled, let threats = seaArmiesByComp[component]?.filter({ enemy($0.nation) }), !threats.isEmpty else { return false }
                    var intercept: (port: Port, distToFoe: Double, sailDist: Double)?
                    for port in candidates {
                        let landCtrl = landById[port.provinceId]?.controller.asString ?? ""
                        guard landCtrl == nation || enemy(landCtrl) else { continue }
                        let df = threats.reduce(Double.infinity) { min($0, jsHypot(port.center.x - $1.point.x, port.center.y - $1.point.y)) }
                        let sailD: Double
                        if atAnchor(port) { sailD = 0 }
                        else {
                            let p = preview(r, id, .sail(port: port.id))
                            guard p.valid && food >= rationNow * (days(p.distance) + 3) + reserveFood else { continue }
                            sailD = p.distance
                        }
                        if intercept == nil || df < intercept!.distToFoe { intercept = (port, df, sailD) }
                    }
                    guard let intercept else { return false }
                    order.targetId = enemy(landById[intercept.port.provinceId]?.controller.asString ?? "") ? JS(intercept.port.provinceId) : .null
                    if atAnchor(intercept.port) { row.assignedPortId = JS(intercept.port.id); note("attacking", activeMission == .raid ? "破交伏击敌方跨海运兵船队。" : "守株待兔，在敌军渡海登陆口截击。") }
                    else { start(intercept.port.id, "attacking", activeMission == .raid ? "奉破交令全速截杀敌跨海运兵船队。" : "敌军渡海来犯，沿真实海路驰援截击登陆航道。") }
                    return true
                }
                func tryEscort() -> Bool {
                    guard UnitKinds.enabled, let convoys = seaArmiesByComp[component]?.filter({ $0.nation == nation }), !convoys.isEmpty else { return false }
                    var escortPick: (port: Port, distToConvoy: Double)?
                    for port in candidates {
                        let df = convoys.reduce(Double.infinity) { min($0, jsHypot(port.center.x - $1.point.x, port.center.y - $1.point.y)) }
                        if atAnchor(port) {
                            if escortPick == nil || df < escortPick!.distToConvoy { escortPick = (port, df) }
                        } else {
                            let p = preview(r, id, .sail(port: port.id))
                            if p.valid && food >= rationNow * (days(p.distance) + 3) + reserveFood {
                                if escortPick == nil || df < escortPick!.distToConvoy { escortPick = (port, df) }
                            }
                        }
                    }
                    guard let escortPick else { return false }
                    order.targetId = enemy(landById[escortPick.port.provinceId]?.controller.asString ?? "") ? JS(escortPick.port.provinceId) : .null
                    if atAnchor(escortPick.port) { row.assignedPortId = JS(escortPick.port.id); note("guarding", "在渡海航道锚位护航己方运兵船队与两栖登陆。") }
                    else { start(escortPick.port.id, "guarding", "驰往渡海航道为己方运兵船队护航并提供岸轰支援。") }
                    return true
                }
                func tryPortAttack() -> Bool {
                    var best: (port: Port, control: JS, distance: Double)?
                    for port in candidates {
                        let control = r.portControl.ports[port.provinceId]
                        let isBlockedHome = appNaval && control.landOwnerId.asString == nation && MaritimeWarfare.isPortBlockaded(r, provinceId: port.provinceId, landOwner: nation)
                        guard isBlockedHome || portTarget(control, nation, enemy) else { continue }
                        var row0: (port: Port, control: JS, distance: Double)?
                        if atAnchor(port) { row0 = (port, control, 0) }
                        else { let p = preview(r, id, .sail(port: port.id)); if p.valid && food >= rationNow * (days(p.distance) + 3) + reserveFood { row0 = (port, control, p.distance) } }
                        guard let c = row0 else { continue }
                        func rankOf(_ x: (port: Port, control: JS, distance: Double)) -> Int {
                            if x.control.landOwnerId.asString == nation { return activeMission == .blockade ? 1 : 0 }
                            if activeMission == .blockade {
                                // 封锁指令优先压制尚未被封锁的敌国主力海港
                                let already = MaritimeWarfare.isPortBlockaded(r, provinceId: x.port.provinceId, landOwner: x.control.landOwnerId.optionalString)
                                return already ? 2 : 0
                            }
                            if UnitKinds.enabled && view.atPort(x.port.id).contains(where: { enemy($0.fleet.nationId.asString) }) { return 1 }
                            return UnitKinds.enabled ? 2 : 1
                        }
                        let rank = rankOf(c), bestRank = best.map(rankOf) ?? 3
                        if best == nil || rank < bestRank || rank == bestRank && c.distance < best!.distance { best = c }
                    }
                    guard let best else { return false }
                    order.targetId = JS(best.port.provinceId)
                    if atAnchor(best.port) { row.assignedPortId = JS(best.port.id); note("attacking", activeMission == .blockade ? "死锁敌港外海，切断海运并截夺海贸岁入。" : "在实际敌港等待争夺完成。") }
                    else { start(best.port.id, "attacking", best.control.landOwnerId.asString == nation ? "驰援本国受困海港，破除敌舰封锁。" : (activeMission == .blockade ? "奉封锁令抵近敌港实施海上封锁。" : "前往可在余粮范围内抵达的敌港。")) }
                    return true
                }
                func tryHuntFleet() -> Bool {
                    guard appNaval else { return false }
                    let enemyFleets = view.fleets.filter {
                        $0.fleet.id.asString != id && enemy($0.fleet.nationId.asString) && sea.component($0.face) == component
                    }
                    guard !enemyFleets.isEmpty else { return false }
                    var bestPick: (port: Port, distToEnemy: Double)?
                    for port in candidates {
                        let landCtrl = landById[port.provinceId]?.controller.asString ?? ""
                        guard landCtrl == nation || enemy(landCtrl) || RunWindow.access(r, nation, landCtrl) else { continue }
                        let de = enemyFleets.reduce(Double.infinity) { min($0, jsHypot(port.center.x - $1.point.x, port.center.y - $1.point.y)) }
                        guard de <= 130 else { continue }
                        if atAnchor(port) {
                            if bestPick == nil || de < bestPick!.distToEnemy { bestPick = (port, de) }
                        } else {
                            let p = preview(r, id, .sail(port: port.id))
                            if p.valid && food >= rationNow * (days(p.distance) + 3) + reserveFood {
                                if bestPick == nil || de < bestPick!.distToEnemy { bestPick = (port, de) }
                            }
                        }
                    }
                    guard let bestPick else { return false }
                    order.targetId = enemy(landById[bestPick.port.provinceId]?.controller.asString ?? "") ? JS(bestPick.port.provinceId) : .null
                    if atAnchor(bestPick.port) { row.assignedPortId = JS(bestPick.port.id); note("attacking", "巡弋战区主动寻歼敌国主力舰队。") }
                    else { start(bestPick.port.id, "attacking", "主动出击猎杀同海域敌国主力舰队，争夺制海权。") }
                    return true
                }
                func tryShoreSupport() -> Bool {
                    guard appNaval else { return false }
                    // 优先驰援正在围攻敌国沿海州郡的己方陆军，提供 +22% 舰炮破城火力！
                    let activeSiegePids = Set(r.occupation.sieges.asArray.filter { $0.attacker.asString == nation }.map(\.provinceId.asString))
                    guard !activeSiegePids.isEmpty else { return false }
                    var bestPort: (port: Port, dist: Double)?
                    for port in candidates where activeSiegePids.contains(port.provinceId) {
                        if atAnchor(port) { bestPort = (port, 0); break }
                        let p = preview(r, id, .sail(port: port.id))
                        if p.valid && food >= rationNow * (days(p.distance) + 3) + reserveFood {
                            if bestPort == nil || p.distance < bestPort!.dist { bestPort = (port, p.distance) }
                        }
                    }
                    guard let bestPort else { return false }
                    order.targetId = JS(bestPort.port.provinceId)
                    if atAnchor(bestPort.port) { row.assignedPortId = JS(bestPort.port.id); note("attacking", "近海舰炮岸轰，强力支援己方陆军破城！") }
                    else { start(bestPort.port.id, "attacking", "驰赴友军沿海围城战区，实施近海舰炮岸轰支援。") }
                    return true
                }
                let dispatched: Bool
                switch activeMission {
                case .escort:   dispatched = tryEscort() || tryShoreSupport() || tryIntercept() || tryPortAttack()
                case .blockade: dispatched = tryPortAttack() || tryShoreSupport() || tryIntercept() || tryEscort()
                case .raid:     dispatched = tryIntercept() || tryHuntFleet() || tryPortAttack() || tryEscort()
                case .patrol, .refit: dispatched = tryIntercept() || tryHuntFleet() || tryShoreSupport() || tryEscort() || tryPortAttack()
                }
                if dispatched { continue }
            }
            var available = [(port: Port, distance: Double)]()
            for port in safe {
                if atAnchor(port) { available.append((port, 0)); continue }
                let p = preview(r, id, .sail(port: port.id))
                if p.valid && (low || food >= rationNow * (days(p.distance) + 3)) { available.append((port, p.distance)) }
            }
            var chosen: (port: Port, distance: Double)?
            if low { chosen = available.enumerated().sorted { $0.element.distance != $1.element.distance ? $0.element.distance < $1.element.distance : $0.offset < $1.offset }.first?.element }
            else {
                let rows = idleWeights(available.map { v in
                    IdleRow(id: v.port.id, present: view.atPort(v.port.id).filter { $0.fleet.nationId.asString == nation }.count,
                            assigned: view.fleets.filter { o in
                                let other = o.fleet, oid = other.id.asString
                                return other.nationId.asString == nation && other.patrol.asBool && !r.voyages.manualFleets.asArray.contains { $0.asString == oid } && !view.held.contains(fleetKey(oid))
                                    && !((r.maritime.retreating[oid].optionalNumber ?? -.infinity) > now) && s.fleets[oid].decision.asString == "guarding" && s.fleets[oid].assignedPortId.optionalString == v.port.id
                            }.count)
                }, war: atWarNow, preferred: assigned, current: here?.id, home: row.homePortId.optionalString)
                let pick = chooseIdle(rows) { draw(s) }
                chosen = available.first { $0.port.id == pick?.id }
            }
            order.targetId = .null
            guard let chosen else { row.assignedPortId = .null; note("no-route", low ? "同一海域没有有余粮且可达的安全本国海港；保留实际位置。" : "当前没有满足海路与余粮条件的敌港或本国驻泊港。"); continue }
            row.nextTick = JS(now + (idleDelay(atWarNow) { draw(s) } * Double(scheduleTicks)).rounded(.up))
            if atAnchor(chosen.port) { row.assignedPortId = JS(chosen.port.id); note(low ? "resupply" : "guarding", low ? "等待实际日粮补给。" : "在本国锚点驻防。") }
            else { start(chosen.port.id, low ? "resupply" : "guarding", low ? "余粮不足，沿真实海路返回最近可补粮港口。" : "按原作港口拥挤权重重新部署。") }
        }
        if r.portControl.json != portBefore { revise(r) }
        s.lastTick = JS(now); s.revision = JS(s.revision.asNumber + 1)
    }

    // MARK: Daily rations (settleFleetFood47)
    public static func settleFleetFood(_ r: JS) {
        guard let sea, Armies.bridge != nil else { return }
        let all = fleets(r); reconcileLandOwners(r)
        if all.isEmpty { return }
        let view = presence(r), space = Armies.space(r)
        for fl in all where fl.status.asString != "lost" {
            let id = fl.id.asString, nation = fl.nationId.asString, travel = r.fleetPositions.records[id]
            guard let at = view.fleets.first(where: { $0.fleet.id.asString == id }) else { continue }
            var port: Port?
            if ["arrived", "halted"].contains(travel.status.asString) && !view.held.contains(fleetKey(id)) && !((r.maritime.retreating[id].optionalNumber ?? -.infinity) > r.clock.tick.asNumber) {
                port = sea.ports.first { p in
                    let land = r.world.provinces.asArray.first { $0.id.asString == p.provinceId }!
                    return at.face == p.node && jsHypot(at.point.x - p.center.x, at.point.y - p.center.y) <= 1e-8 && land.controller.asString == nation && land.legalOwner.asString == nation
                        && r.portControl.ports[p.provinceId].occupierId.optionalString == nation && !landHolders(space, p.provinceId).contains { atWar(r, $0.nationId.asString, nation) }
                }
            }
            if let port {
                let stock = r.world.statecraft.provinces.asArray.first { $0.provinceId.asString == port.provinceId }!
                let amount = max(0, min(fl.crew.asNumber * 60 - fl.food.asNumber, stock.grain.asNumber - stock.population.asNumber * 10))
                stock.grain = JS(stock.grain.asNumber - amount); fl.food = JS(fl.food.asNumber + amount)
            }
            let rr = Double(ration(fl.crew.asInt)), starving = fl.food.asNumber < rr
            fl.food = JS(max(0, fl.food.asNumber - rr)); if !starving { continue }
            let crew = fl.crew.asInt, lost = min(crew, max(1, Int((Double(crew) * 0.05).rounded(.down))))
            fl.crew = JS(crew - lost); Wars.recordLoss(r, nation, "crew", lost)
            Daily.event(r, "supply", "\(fl.name.asString)断粮损失\(lost)名船员", "只有实际停在安全本国港口锚点才能补粮；不足一日粮按当前船员5%向下取整、至少1人减员。")
            if fl.crew.asInt > 0 { continue }
            Wars.recordLoss(r, nation, "hull", value: r.maritime.hulls[id].asNumber); Wars.recordLoss(r, nation, "ships", fl.ships.asInt); r.maritime.hulls[id] = JS(0)
            fl.status = JS("lost"); fl.patrol = JS(false); fl.dockId = .null; fl.targetId = .null; fl.route = .array(); fl.progress = JS(0)
            let t = travel.clone(); t.status = JS("halted"); r.fleetPositions.records[id] = t; r.maritime.retreating.delete(id)
            let order = r.portControl.fleets[id]; order.active = JS(false); order.targetId = .null; order.forwardBaseId = .null
            r.portControl.attackFleetIds = .array(r.portControl.attackFleetIds.asArray.filter { $0.asString != id }); revise(r)
        }
    }
    /// 海上封锁: a state's ports, and how many of them an enemy fleet holds now.
    static func blockade(_ r: JS, _ id: String) -> (ports: Int, held: Int) {
        guard !r.portControl.isNull, !r.portControl.ports.isNull else { return (0, 0) }
        var ports = 0, held = 0
        for (_, c) in r.portControl.ports.objectEntries where c.landOwnerId.optionalString == id {
            ports += 1
            if let o = c.occupierId.optionalString, o != id, atWar(r, id, o) { held += 1 }
        }
        return (ports, held)
    }
}
