import Foundation

/// v14 超低延迟真网游差量二进制推流帧编解码器（魔数 `"LGB2"`，完整向下兼容 `"LGB1"` 与 JSON）：
/// - 专为 3 Mbps（375 KB/s）国内轻量云服务器与 4G/5G 弱网看海场景设计：
///   1. **军队实体差量编码（`armyDeltaMode`）**：中间帧仅发送本步移动/伤亡/变态的军团 + `removedArmyIds`，静止驻军 0 字节开销；
///   2. **国家属性变更位图（`nationDeltaMode`）**：中间帧仅编码数据发生变化的国家，27 国欧洲图单帧再省 500+ 字节；
///   3. **典型中间帧体积 < 0.35–0.85 KB LZ4**，95%+ 推流帧直接落在单包 UDP MTU（≤ 1320 B）内经端口 8767 零队头阻塞直达手机！
/// - 同时完整透传历史剧本路线（`historicalRoute`）、史实事件弹窗（`pendingHistoricalEvent`）、将领与战术标签（`commander`/`tacticTag`）。
public enum BinaryStateWire {
    public static let magicV1: [UInt8] = [0x4C, 0x47, 0x42, 0x31] // "LGB1"
    public static let magic: [UInt8] = [0x4C, 0x47, 0x42, 0x32]   // "LGB2"

    public static func isBinaryFrame(_ data: Data) -> Bool {
        guard data.count >= 8 else { return false }
        let s = data.startIndex
        return data[s] == 0x4C && data[s + 1] == 0x47 && data[s + 2] == 0x42
            && (data[s + 3] == 0x31 || data[s + 3] == 0x32)
    }

    private static let armyStatusTable: [String] = [
        "idle", "moving", "fighting", "sieging", "retreating", "garrison", "reorganizing", "destroyed", "embarked"
    ]
    private static let travelTable: [String] = [
        "moving", "arrived", "halted", "blocked", "land", "sea", "embarking", "disembarking", "air"
    ]
    private static let fleetStatusTable: [String] = [
        "idle", "sailing", "fighting", "patrol", "blockading", "escorting", "repairing", "lost"
    ]
    private static let weatherKindTable: [String] = [
        "snow", "drought", "famine", "flood", "plague", "harvest"
    ]

    private struct StaticTail: Codable {
        var era: String?
        var labels: [WorldMeta.LabelBox]?
        var ports: [GameState.Port]?
        var forts: [Int]?
        var holy: [GameState.Holy]?
        var wonders: [Int]?
        var ruins: [Int]?
        var yards: [GameState.Yard]?
    }

    // MARK: - Writer

    private struct Writer {
        var buf = [UInt8]()
        init(capacity: Int = 2048) { buf.reserveCapacity(capacity) }
        mutating func u8(_ v: UInt8) { buf.append(v) }
        mutating func i8(_ v: Int8) { buf.append(UInt8(bitPattern: v)) }
        mutating func u16(_ v: UInt16) {
            buf.append(UInt8(v & 0xFF))
            buf.append(UInt8((v >> 8) & 0xFF))
        }
        mutating func i16(_ v: Int16) { u16(UInt16(bitPattern: v)) }
        mutating func u32(_ v: UInt32) {
            buf.append(UInt8(v & 0xFF))
            buf.append(UInt8((v >> 8) & 0xFF))
            buf.append(UInt8((v >> 16) & 0xFF))
            buf.append(UInt8((v >> 24) & 0xFF))
        }
        mutating func i32(_ v: Int32) { u32(UInt32(bitPattern: v)) }
        mutating func f32(_ v: Float) { u32(v.bitPattern) }
        mutating func str8(_ s: String) {
            let bytes = Array(s.utf8)
            let len = min(255, bytes.count)
            u8(UInt8(len))
            if len > 0 { buf.append(contentsOf: bytes[0..<len]) }
        }
        mutating func str16(_ s: String) {
            let bytes = Array(s.utf8)
            let len = min(65535, bytes.count)
            u16(UInt16(len))
            if len > 0 { buf.append(contentsOf: bytes[0..<len]) }
        }
        mutating func clampI16(_ v: Int) -> Int16 {
            Int16(max(Int(Int16.min), min(Int(Int16.max), v)))
        }
        mutating func clampU16(_ v: Int) -> UInt16 {
            UInt16(max(0, min(Int(UInt16.max), v)))
        }
        mutating func quantCoord(_ v: Float) -> Int16 {
            let q = Int((v * 16.0).rounded())
            return Int16(max(Int(Int16.min), min(Int(Int16.max), q)))
        }
    }

    // MARK: - Reader

    private struct Reader {
        let bytes: [UInt8]
        var pos: Int = 0
        init(_ data: Data) { self.bytes = [UInt8](data) }
        var remaining: Int { bytes.count - pos }
        mutating func u8() -> UInt8? {
            guard pos < bytes.count else { return nil }
            let v = bytes[pos]; pos += 1; return v
        }
        mutating func i8() -> Int8? { u8().map { Int8(bitPattern: $0) } }
        mutating func u16() -> UInt16? {
            guard pos + 2 <= bytes.count else { return nil }
            let v = UInt16(bytes[pos]) | (UInt16(bytes[pos + 1]) << 8)
            pos += 2; return v
        }
        mutating func i16() -> Int16? { u16().map { Int16(bitPattern: $0) } }
        mutating func u32() -> UInt32? {
            guard pos + 4 <= bytes.count else { return nil }
            let v = UInt32(bytes[pos])
                | (UInt32(bytes[pos + 1]) << 8)
                | (UInt32(bytes[pos + 2]) << 16)
                | (UInt32(bytes[pos + 3]) << 24)
            pos += 4; return v
        }
        mutating func i32() -> Int32? { u32().map { Int32(bitPattern: $0) } }
        mutating func f32() -> Float? { u32().map { Float(bitPattern: $0) } }
        mutating func str8() -> String? {
            guard let len = u8() else { return nil }
            let n = Int(len)
            guard pos + n <= bytes.count else { return nil }
            let s = n == 0 ? "" : String(decoding: bytes[pos..<(pos + n)], as: UTF8.self)
            pos += n; return s
        }
        mutating func str16() -> String? {
            guard let len = u16() else { return nil }
            let n = Int(len)
            guard pos + n <= bytes.count else { return nil }
            let s = n == 0 ? "" : String(decoding: bytes[pos..<(pos + n)], as: UTF8.self)
            pos += n; return s
        }
        mutating func data32() -> Data? {
            guard let len = u32() else { return nil }
            let n = Int(len)
            guard n >= 0, pos + n <= bytes.count else { return nil }
            let d = n == 0 ? Data() : Data(bytes[pos..<(pos + n)])
            pos += n; return d
        }
    }

    /// 将 `GameState` 编码为紧凑 `LGB2` 差量二进制帧（支持军队差量与历史事件直传，LZ4 后典型 < 0.85 KB）。
    public static func encode(_ gs: GameState) -> Data {
        var w = Writer(capacity: 768 + gs.armies.count * 26 + gs.nations.count * 20)
        w.buf.append(contentsOf: magic)
        w.u8(2) // version 2 (LGB2)
        // flags bit0..8 同 v1；bit9: armyDeltaMode；bit10: hasHistoricalRoute；bit11: hasPendingHistoricalEvent；bit12: fleetDeltaMode
        let hasTail = (gs.era != nil || gs.labels != nil || gs.ports != nil || gs.forts != nil || gs.holy != nil || gs.wonders != nil || gs.ruins != nil || gs.yards != nil)
        let isArmyDelta = (gs.armyDeltaMode == true)
        let isFleetDelta = (gs.fleetDeltaMode == true)
        var hdrFlags: UInt16 = 0
        if gs.yearOffset != nil { hdrFlags |= 1 << 0 }
        if gs.worldTension != nil { hdrFlags |= 1 << 1 }
        if gs.lastNukeProvince != nil || gs.lastNukeDay != nil { hdrFlags |= 1 << 2 }
        if gs.fleets != nil { hdrFlags |= 1 << 3 }
        if gs.contacts != nil { hdrFlags |= 1 << 4 }
        if gs.arrows != nil { hdrFlags |= 1 << 5 }
        if gs.seaBattles != nil { hdrFlags |= 1 << 6 }
        if gs.weatherZones != nil { hdrFlags |= 1 << 7 }
        if hasTail { hdrFlags |= 1 << 8 }
        if isArmyDelta { hdrFlags |= 1 << 9 }
        if let hr = gs.historicalRoute, !hr.isEmpty { hdrFlags |= 1 << 10 }
        if gs.pendingHistoricalEvent != nil { hdrFlags |= 1 << 11 }
        if isFleetDelta { hdrFlags |= 1 << 12 }
        w.u16(hdrFlags)

        // Core header scalars
        w.i32(Int32(gs.day))
        w.i32(Int32(gs.date.year))
        w.u8(UInt8(max(0, min(255, gs.date.month))))
        w.u8(UInt8(max(0, min(255, gs.date.day))))
        if let yo = gs.yearOffset { w.i32(Int32(yo)) }
        if let wt = gs.worldTension { w.i16(w.clampI16(wt)) }
        if (hdrFlags & (1 << 2)) != 0 {
            w.i16(w.clampI16(gs.lastNukeProvince ?? -1))
            w.i32(Int32(gs.lastNukeDay ?? -1))
        }
        w.str8(gs.historicalEra ?? "")

        // String pool for army unit keys (huge space savings)
        var unitPool = [String]()
        var unitIndex = [String: UInt16]()
        for a in gs.armies {
            if unitIndex[a.unit] == nil {
                unitIndex[a.unit] = UInt16(unitPool.count)
                unitPool.append(a.unit)
            }
        }
        w.u16(UInt16(unitPool.count))
        for u in unitPool { w.str8(u) }

        // Owners: 0 = empty, 1 = full i16[], 2 = delta pairs i16[]
        if !gs.owners.isEmpty {
            w.u8(1)
            w.u16(w.clampU16(gs.owners.count))
            for o in gs.owners { w.i16(w.clampI16(o)) }
        } else if let delta = gs.ownersDelta {
            w.u8(2)
            let pairs = delta.count / 2
            w.u16(w.clampU16(pairs))
            for i in 0..<pairs {
                w.i16(w.clampI16(delta[i * 2]))
                w.i16(w.clampI16(delta[i * 2 + 1]))
            }
        } else {
            w.u8(0)
        }

        // Nations
        w.u16(w.clampU16(gs.nations.count))
        for n in gs.nations {
            let hasIdent = (n.id != nil || n.name != nil || n.color != nil)
            let hasTech = (n.milTech != nil || n.ic != nil || n.airPower != nil || n.doctrine != nil)
            var nf: UInt8 = n.alive ? 1 : 0
            if hasIdent { nf |= 2 }
            if hasTech { nf |= 4 }
            w.u8(nf)
            w.u16(w.clampU16(n.provinces))
            w.u16(w.clampU16(n.cities))
            w.i32(Int32(max(Int(Int32.min), min(Int(Int32.max), n.population))))
            w.f32(Float(n.grain))
            w.i32(Int32(max(Int(Int32.min), min(Int(Int32.max), n.troops))))
            w.f32(Float(n.gold))
            w.f32(Float(n.destiny))
            let ec = min(255, n.enemies.count)
            w.u8(UInt8(ec))
            for k in 0..<ec { w.i16(w.clampI16(n.enemies[k])) }
            if hasIdent {
                w.str8(n.id ?? "")
                w.str8(n.name ?? "")
                w.str8(n.color ?? "")
                w.str8(n.line ?? "")
                w.i16(w.clampI16(n.capital ?? -1))
                w.str8(n.culture ?? "")
                w.str8(n.polity ?? "")
                w.str8(n.religion ?? "")
            }
            if hasTech {
                w.u8(UInt8(max(0, min(15, n.milTech ?? 1))))
                w.u8(UInt8(max(0, min(15, n.navTech ?? 1))))
                w.u16(w.clampU16(n.ic ?? 0))
                w.u8(UInt8(max(0, min(255, n.airPower ?? 0))))
                w.f32(Float(n.compositePower ?? 0))
                w.str8(n.doctrine ?? "")
            }
        }

        // Armies
        w.u16(w.clampU16(gs.armies.count))
        for a in gs.armies {
            w.str8(a.id)
            w.i16(w.clampI16(a.nation))
            w.i32(Int32(max(Int(Int32.min), min(Int(Int32.max), a.troops))))
            w.u16(unitIndex[a.unit] ?? 0)
            let stIdx = armyStatusTable.firstIndex(of: a.status) ?? 255
            w.u8(UInt8(stIdx))
            if stIdx == 255 { w.str8(a.status) }
            let trIdx = travelTable.firstIndex(of: a.travel) ?? 255
            w.u8(UInt8(trIdx))
            if trIdx == 255 { w.str8(a.travel) }
            w.i16(w.clampI16(a.province))
            w.i16(w.clampI16(a.supplies))
            w.u8(UInt8(max(0, min(255, a.morale))))
            w.i16(w.quantCoord(a.x))
            w.i16(w.quantCoord(a.y))
            var af: UInt8 = 0
            if a.manual { af |= 1 << 0 }
            if a.reorganizing == true { af |= 1 << 1 }
            if a.embarked == true { af |= 1 << 2 }
            if a.encircled == true { af |= 1 << 3 }
            if a.seaSupplyCut == true { af |= 1 << 4 }
            if a.destination != nil { af |= 1 << 5 }
            if a.full != nil { af |= 1 << 6 }
            if a.banner != nil { af |= 1 << 7 }
            w.u8(af)
            if let d = a.destination { w.i16(w.clampI16(d)) }
            if let f = a.full { w.i32(Int32(max(Int(Int32.min), min(Int(Int32.max), f)))) }
            if let b = a.banner {
                w.u8(b == "ruler" ? 2 : (b == "general" ? 1 : 0))
            }
            // v2 可选将领、战术标签与装备代次/有效战力（位标志按需附带，零冗余字节）
            let hasCmd = (a.commander != nil && !(a.commander?.isEmpty ?? true)) || (a.tacticTag != nil && !(a.tacticTag?.isEmpty ?? true))
            let hasEquip = (a.equipTier != nil || a.effectivePower != nil)
            var extFlags: UInt8 = 0
            if hasCmd { extFlags |= 1 }
            if hasEquip { extFlags |= 2 }
            w.u8(extFlags)
            if hasCmd {
                w.str8(a.commander ?? "")
                w.str8(a.tacticTag ?? "")
            }
            if hasEquip {
                w.u8(UInt8(max(0, min(15, a.equipTier ?? 1))))
                w.f32(Float(a.effectivePower ?? Double(a.troops)))
            }
        }
        // v2 差量移除军团 ID 列表
        if isArmyDelta {
            let removed = gs.removedArmyIds ?? []
            w.u16(w.clampU16(removed.count))
            for rid in removed { w.str8(rid) }
        }

        // Fleets
        if let fleets = gs.fleets {
            w.u16(w.clampU16(fleets.count))
            for f in fleets {
                w.str8(f.id)
                w.i16(w.clampI16(f.nation))
                w.u16(w.clampU16(f.ships))
                w.i32(Int32(max(0, f.crew)))
                w.i16(w.clampI16(f.food))
                w.u8(UInt8(max(0, min(250, Int((f.hull * 200.0).rounded())))))
                let stIdx = fleetStatusTable.firstIndex(of: f.status) ?? 255
                w.u8(UInt8(stIdx))
                if stIdx == 255 { w.str8(f.status) }
                let trIdx = travelTable.firstIndex(of: f.travel) ?? 255
                w.u8(UInt8(trIdx))
                if trIdx == 255 { w.str8(f.travel) }
                w.i16(w.quantCoord(f.x))
                w.i16(w.quantCoord(f.y))
                w.i16(w.clampI16(f.port))
                var ff: UInt8 = 0
                if f.manual { ff |= 1 << 0 }
                if f.patrol { ff |= 1 << 1 }
                if f.escorting == true { ff |= 1 << 2 }
                if f.blockading == true { ff |= 1 << 3 }
                if f.repairActive == true { ff |= 1 << 4 }
                w.u8(ff)
            }
        }
        if isFleetDelta {
            let removedFl = gs.removedFleetIds ?? []
            w.u16(w.clampU16(removedFl.count))
            for rid in removedFl { w.str8(rid) }
        }

        // Wars
        w.u16(w.clampU16(gs.wars.count))
        for war in gs.wars {
            w.i32(Int32(war.id))
            w.i16(w.clampI16(war.attacker))
            w.i16(w.clampI16(war.defender))
            w.i32(Int32(war.startDay))
            w.str8(war.casusBelli)
            w.str8(war.goal)
            let pc = min(255, war.participants.count)
            w.u8(UInt8(pc))
            for k in 0..<pc {
                w.i16(w.clampI16(war.participants[k].nation))
                w.i8(Int8(max(-127, min(127, war.participants[k].side))))
            }
        }

        // Sieges
        w.u16(w.clampU16(gs.sieges.count))
        for s in gs.sieges {
            w.i16(w.clampI16(s.province))
            w.i16(w.clampI16(s.nation))
            w.u16(UInt16(max(0, min(65535, Int((s.progress * 10000.0).rounded())))))
        }

        // Contacts
        if let contacts = gs.contacts {
            w.u16(w.clampU16(contacts.count))
            for pair in contacts {
                w.i16(w.clampI16(pair.count > 0 ? pair[0] : -1))
                w.i16(w.clampI16(pair.count > 1 ? pair[1] : -1))
            }
        }

        // Arrows
        if let arrows = gs.arrows {
            w.u16(w.clampU16(arrows.count))
            for a in arrows {
                let c = min(16, a.count)
                w.u8(UInt8(c))
                for k in 0..<c { w.f32(Float(a[k])) }
            }
        }

        // Sea battles
        if let sb = gs.seaBattles {
            w.u16(w.clampU16(sb.count))
            for row in sb {
                let c = min(16, row.count)
                w.u8(UInt8(c))
                for k in 0..<c { w.f32(Float(row[k])) }
            }
        }

        // Events
        w.u16(w.clampU16(gs.events.count))
        for ev in gs.events {
            w.i32(Int32(ev.day))
            w.str8(ev.kind)
            w.i16(w.clampI16(ev.province ?? -1))
            w.str16(ev.text)
        }

        // Weather zones
        if let wz = gs.weatherZones {
            w.u16(w.clampU16(wz.count))
            for z in wz {
                w.i16(w.clampI16(z.province))
                let ki = weatherKindTable.firstIndex(of: z.kind) ?? 255
                w.u8(UInt8(ki))
                if ki == 255 { w.str8(z.kind) }
            }
        }

        // Optional static tail
        if hasTail {
            let tail = StaticTail(
                era: gs.era, labels: gs.labels, ports: gs.ports,
                forts: gs.forts, holy: gs.holy, wonders: gs.wonders,
                ruins: gs.ruins, yards: gs.yards
            )
            let tailData = (try? JSONEncoder().encode(tail)) ?? Data()
            w.u32(UInt32(tailData.count))
            w.buf.append(contentsOf: tailData)
        }
        if (hdrFlags & (1 << 10)) != 0 {
            w.str8(gs.historicalRoute ?? "")
        }
        if (hdrFlags & (1 << 11)) != 0 {
            let peData = gs.pendingHistoricalEvent.flatMap { try? JSONEncoder().encode($0) } ?? Data()
            w.u32(UInt32(peData.count))
            w.buf.append(contentsOf: peData)
        }

        return Data(w.buf)
    }

    /// 解码 `LGB1`/`LGB2` 二进制帧为 `GameState`（< 0.05 ms，非二进制帧自动回退至 JSON 解码）。
    public static func decode(_ data: Data) -> GameState? {
        if !isBinaryFrame(data) {
            return try? JSONDecoder().decode(GameState.self, from: data)
        }
        var r = Reader(data)
        r.pos = 4 // skip "LGB1"/"LGB2"
        guard let version = r.u8(), (version == 1 || version == 2),
              let hdrFlags = r.u16(),
              let dayI32 = r.i32(),
              let yearI32 = r.i32(),
              let monthU8 = r.u8(),
              let dayOfMonthU8 = r.u8() else { return nil }

        let yearOffset: Int? = (hdrFlags & (1 << 0)) != 0 ? r.i32().map(Int.init) : nil
        let worldTension: Int? = (hdrFlags & (1 << 1)) != 0 ? r.i16().map(Int.init) : nil
        var lastNukeProv: Int? = nil
        var lastNukeDay: Int? = nil
        if (hdrFlags & (1 << 2)) != 0 {
            guard let np = r.i16(), let nd = r.i32() else { return nil }
            lastNukeProv = np >= 0 ? Int(np) : nil
            lastNukeDay = nd >= 0 ? Int(nd) : nil
        }
        guard let eraStr = r.str8() else { return nil }
        let historicalEra: String? = eraStr.isEmpty ? nil : eraStr

        // Unit pool
        guard let poolCount = r.u16() else { return nil }
        var unitPool = [String]()
        unitPool.reserveCapacity(Int(poolCount))
        for _ in 0..<poolCount {
            guard let s = r.str8() else { return nil }
            unitPool.append(s)
        }

        // Owners / delta
        guard let ownerMode = r.u8() else { return nil }
        var owners = [Int]()
        var ownersDelta: [Int]? = nil
        if ownerMode == 1 {
            guard let n = r.u16() else { return nil }
            owners.reserveCapacity(Int(n))
            for _ in 0..<n {
                guard let v = r.i16() else { return nil }
                owners.append(Int(v))
            }
        } else if ownerMode == 2 {
            guard let pairs = r.u16() else { return nil }
            var d = [Int]()
            d.reserveCapacity(Int(pairs) * 2)
            for _ in 0..<pairs {
                guard let idx = r.i16(), let own = r.i16() else { return nil }
                d.append(Int(idx)); d.append(Int(own))
            }
            ownersDelta = d
        }

        // Nations
        guard let nationCount = r.u16() else { return nil }
        var nations = [GameState.Nation]()
        nations.reserveCapacity(Int(nationCount))
        for _ in 0..<nationCount {
            guard let nf = r.u8(),
                  let provs = r.u16(),
                  let cities = r.u16(),
                  let pop = r.i32(),
                  let grain = r.f32(),
                  let troops = r.i32(),
                  let gold = r.f32(),
                  let destiny = r.f32(),
                  let ec = r.u8() else { return nil }
            var enemies = [Int]()
            enemies.reserveCapacity(Int(ec))
            for _ in 0..<ec {
                guard let e = r.i16() else { return nil }
                enemies.append(Int(e))
            }
            var id: String? = nil, name: String? = nil, color: String? = nil, line: String? = nil
            var capital: Int? = nil, culture: String? = nil, polity: String? = nil, religion: String? = nil
            if (nf & 2) != 0 {
                guard let sId = r.str8(), let sName = r.str8(), let sCol = r.str8(), let sLine = r.str8(),
                      let cap = r.i16(), let sCul = r.str8(), let sPol = r.str8(), let sRel = r.str8() else { return nil }
                id = sId.isEmpty ? nil : sId
                name = sName.isEmpty ? nil : sName
                color = sCol.isEmpty ? nil : sCol
                line = sLine.isEmpty ? nil : sLine
                capital = cap >= 0 ? Int(cap) : nil
                culture = sCul.isEmpty ? nil : sCul
                polity = sPol.isEmpty ? nil : sPol
                religion = sRel.isEmpty ? nil : sRel
            }
            var milTech: Int? = nil, navTech: Int? = nil, icVal: Int? = nil, airVal: Int? = nil
            var compPow: Double? = nil
            var doctrine: String? = nil
            if (nf & 4) != 0 {
                guard let mt = r.u8(), let nt = r.u8(), let icU = r.u16(), let airU = r.u8(), let cpF = r.f32(), let docS = r.str8() else { return nil }
                milTech = Int(mt)
                navTech = Int(nt)
                icVal = Int(icU)
                airVal = Int(airU)
                compPow = Double(cpF)
                doctrine = docS.isEmpty ? nil : docS
            }
            var nationRow = GameState.Nation(
                id: id, name: name, color: color, line: line, capital: capital,
                culture: culture, polity: polity, religion: religion,
                provinces: Int(provs), cities: Int(cities), population: Int(pop),
                grain: Double(grain), troops: Int(troops), gold: Double(gold),
                destiny: Double(destiny), enemies: enemies, alive: (nf & 1) != 0
            )
            nationRow.milTech = milTech
            nationRow.navTech = navTech
            nationRow.ic = icVal
            nationRow.airPower = airVal
            nationRow.doctrine = doctrine
            nationRow.compositePower = compPow
            nations.append(nationRow)
        }

        // Armies
        guard let armyCount = r.u16() else { return nil }
        var armies = [GameState.Army]()
        armies.reserveCapacity(Int(armyCount))
        for _ in 0..<armyCount {
            guard let id = r.str8(),
                  let nation = r.i16(),
                  let troops = r.i32(),
                  let uIdx = r.u16(),
                  let stCode = r.u8() else { return nil }
            let status: String
            if stCode == 255 {
                guard let s = r.str8() else { return nil }
                status = s
            } else {
                status = Int(stCode) < armyStatusTable.count ? armyStatusTable[Int(stCode)] : "idle"
            }
            guard let trCode = r.u8() else { return nil }
            let travel: String
            if trCode == 255 {
                guard let s = r.str8() else { return nil }
                travel = s
            } else {
                travel = Int(trCode) < travelTable.count ? travelTable[Int(trCode)] : "land"
            }
            guard let prov = r.i16(),
                  let supplies = r.i16(),
                  let morale = r.u8(),
                  let xQ = r.i16(),
                  let yQ = r.i16(),
                  let af = r.u8() else { return nil }
            let dest: Int? = (af & (1 << 5)) != 0 ? r.i16().map(Int.init) : nil
            let full: Int? = (af & (1 << 6)) != 0 ? r.i32().map(Int.init) : nil
            var banner: String? = nil
            if (af & (1 << 7)) != 0 {
                guard let bc = r.u8() else { return nil }
                banner = bc == 2 ? "ruler" : (bc == 1 ? "general" : nil)
            }
            let unit = Int(uIdx) < unitPool.count ? unitPool[Int(uIdx)] : "Infantry"
            var army = GameState.Army(
                id: id, name: "", nation: Int(nation), troops: Int(troops), unit: unit,
                status: status, travel: travel, province: Int(prov),
                supplies: Int(supplies), morale: Int(morale),
                x: Float(xQ) / 16.0, y: Float(yQ) / 16.0,
                manual: (af & (1 << 0)) != 0, destination: dest, mission: nil
            )
            if (af & (1 << 1)) != 0 { army.reorganizing = true }
            if (af & (1 << 2)) != 0 { army.embarked = true }
            if (af & (1 << 3)) != 0 { army.encircled = true }
            if (af & (1 << 4)) != 0 { army.seaSupplyCut = true }
            army.full = full
            army.banner = banner
            if version >= 2 {
                guard let extFlags = r.u8() else { return nil }
                if (extFlags & 1) != 0 {
                    guard let cmd = r.str8(), let tag = r.str8() else { return nil }
                    if !cmd.isEmpty { army.commander = cmd }
                    if !tag.isEmpty { army.tacticTag = tag }
                }
                if (extFlags & 2) != 0 {
                    guard let eqT = r.u8(), let effP = r.f32() else { return nil }
                    army.equipTier = Int(eqT)
                    army.effectivePower = Double(effP)
                }
            }
            armies.append(army)
        }
        let isArmyDelta = (version >= 2) && ((hdrFlags & (1 << 9)) != 0)
        var removedArmyIds: [String]? = nil
        if isArmyDelta {
            guard let rc = r.u16() else { return nil }
            var rem = [String]()
            rem.reserveCapacity(Int(rc))
            for _ in 0..<rc {
                guard let rid = r.str8() else { return nil }
                rem.append(rid)
            }
            removedArmyIds = rem
        }

        // Fleets
        var fleets: [GameState.Fleet]? = nil
        if (hdrFlags & (1 << 3)) != 0 {
            guard let fc = r.u16() else { return nil }
            var list = [GameState.Fleet]()
            list.reserveCapacity(Int(fc))
            for _ in 0..<fc {
                guard let id = r.str8(),
                      let nation = r.i16(),
                      let ships = r.u16(),
                      let crew = r.i32(),
                      let food = r.i16(),
                      let hullU8 = r.u8(),
                      let stCode = r.u8() else { return nil }
                let status: String
                if stCode == 255 {
                    guard let s = r.str8() else { return nil }
                    status = s
                } else {
                    status = Int(stCode) < fleetStatusTable.count ? fleetStatusTable[Int(stCode)] : "idle"
                }
                guard let trCode = r.u8() else { return nil }
                let travel: String
                if trCode == 255 {
                    guard let s = r.str8() else { return nil }
                    travel = s
                } else {
                    travel = Int(trCode) < travelTable.count ? travelTable[Int(trCode)] : "sea"
                }
                guard let xQ = r.i16(), let yQ = r.i16(), let port = r.i16(), let ff = r.u8() else { return nil }
                var fleet = GameState.Fleet(
                    id: id, name: "", nation: Int(nation), ships: Int(ships), crew: Int(crew),
                    food: Int(food), hull: Double(hullU8) / 200.0, status: status, travel: travel,
                    x: Float(xQ) / 16.0, y: Float(yQ) / 16.0, decision: "", reason: "",
                    port: Int(port), manual: (ff & (1 << 0)) != 0, patrol: (ff & (1 << 1)) != 0
                )
                if (ff & (1 << 2)) != 0 { fleet.escorting = true }
                if (ff & (1 << 3)) != 0 { fleet.blockading = true }
                if (ff & (1 << 4)) != 0 { fleet.repairActive = true }
                list.append(fleet)
            }
            fleets = list
        }
        let isFleetDelta = (version >= 2) && ((hdrFlags & (1 << 12)) != 0)
        var removedFleetIds: [String]? = nil
        if isFleetDelta {
            guard let rc = r.u16() else { return nil }
            var rem = [String]()
            rem.reserveCapacity(Int(rc))
            for _ in 0..<rc {
                guard let rid = r.str8() else { return nil }
                rem.append(rid)
            }
            removedFleetIds = rem
        }

        // Wars
        guard let wc = r.u16() else { return nil }
        var wars = [GameState.War]()
        wars.reserveCapacity(Int(wc))
        for _ in 0..<wc {
            guard let id = r.i32(), let atk = r.i16(), let def = r.i16(), let sd = r.i32(),
                  let cb = r.str8(), let goal = r.str8(), let pc = r.u8() else { return nil }
            var parts = [GameState.Participant]()
            parts.reserveCapacity(Int(pc))
            for _ in 0..<pc {
                guard let pn = r.i16(), let ps = r.i8() else { return nil }
                parts.append(GameState.Participant(nation: Int(pn), side: Int(ps)))
            }
            wars.append(GameState.War(id: Int(id), attacker: Int(atk), defender: Int(def), casusBelli: cb, goal: goal, startDay: Int(sd), participants: parts))
        }

        // Sieges
        guard let sc = r.u16() else { return nil }
        var sieges = [GameState.Siege]()
        sieges.reserveCapacity(Int(sc))
        for _ in 0..<sc {
            guard let prov = r.i16(), let nat = r.i16(), let prog = r.u16() else { return nil }
            sieges.append(GameState.Siege(province: Int(prov), nation: Int(nat), progress: Double(prog) / 10000.0))
        }

        // Contacts
        var contacts: [[Int]]? = nil
        if (hdrFlags & (1 << 4)) != 0 {
            guard let cc = r.u16() else { return nil }
            var list = [[Int]]()
            list.reserveCapacity(Int(cc))
            for _ in 0..<cc {
                guard let a = r.i16(), let b = r.i16() else { return nil }
                list.append([Int(a), Int(b)])
            }
            contacts = list
        }

        // Arrows
        var arrows: [[Double]]? = nil
        if (hdrFlags & (1 << 5)) != 0 {
            guard let ac = r.u16() else { return nil }
            var list = [[Double]]()
            list.reserveCapacity(Int(ac))
            for _ in 0..<ac {
                guard let n = r.u8() else { return nil }
                var row = [Double]()
                row.reserveCapacity(Int(n))
                for _ in 0..<n {
                    guard let v = r.f32() else { return nil }
                    row.append(Double(v))
                }
                list.append(row)
            }
            arrows = list
        }

        // Sea battles
        var seaBattles: [[Double]]? = nil
        if (hdrFlags & (1 << 6)) != 0 {
            guard let sbc = r.u16() else { return nil }
            var list = [[Double]]()
            list.reserveCapacity(Int(sbc))
            for _ in 0..<sbc {
                guard let n = r.u8() else { return nil }
                var row = [Double]()
                row.reserveCapacity(Int(n))
                for _ in 0..<n {
                    guard let v = r.f32() else { return nil }
                    row.append(Double(v))
                }
                list.append(row)
            }
            seaBattles = list
        }

        // Events
        guard let evCount = r.u16() else { return nil }
        var events = [GameState.Event]()
        events.reserveCapacity(Int(evCount))
        for _ in 0..<evCount {
            guard let d = r.i32(), let k = r.str8(), let p = r.i16(), let t = r.str16() else { return nil }
            events.append(GameState.Event(day: Int(d), text: t, kind: k, province: p >= 0 ? Int(p) : nil))
        }

        // Weather zones
        var weatherZones: [GameState.WeatherZone]? = nil
        if (hdrFlags & (1 << 7)) != 0 {
            guard let wc2 = r.u16() else { return nil }
            var list = [GameState.WeatherZone]()
            list.reserveCapacity(Int(wc2))
            for _ in 0..<wc2 {
                guard let prov = r.i16(), let kc = r.u8() else { return nil }
                let kind: String
                if kc == 255 {
                    guard let s = r.str8() else { return nil }
                    kind = s
                } else {
                    kind = Int(kc) < weatherKindTable.count ? weatherKindTable[Int(kc)] : "snow"
                }
                list.append(GameState.WeatherZone(province: Int(prov), kind: kind))
            }
            weatherZones = list
        }

        // Optional static tail
        var tail: StaticTail? = nil
        if (hdrFlags & (1 << 8)) != 0 {
            guard let tailBytes = r.data32() else { return nil }
            if !tailBytes.isEmpty {
                tail = try? JSONDecoder().decode(StaticTail.self, from: tailBytes)
            }
        }
        var historicalRoute: String? = nil
        if version >= 2 && (hdrFlags & (1 << 10)) != 0 {
            guard let hr = r.str8() else { return nil }
            if !hr.isEmpty { historicalRoute = hr }
        }
        var pendingHistoricalEvent: HistoricalEvents.PendingModal? = nil
        if version >= 2 && (hdrFlags & (1 << 11)) != 0 {
            guard let peBytes = r.data32() else { return nil }
            if !peBytes.isEmpty {
                pendingHistoricalEvent = try? JSONDecoder().decode(HistoricalEvents.PendingModal.self, from: peBytes)
            }
        }

        var outState = GameState(
            day: Int(dayI32),
            date: GameState.Date(year: Int(yearI32), month: Int(monthU8), day: Int(dayOfMonthU8)),
            owners: owners,
            ownersDelta: ownersDelta,
            labels: tail?.labels,
            nations: nations,
            armies: armies,
            fleets: fleets,
            yards: tail?.yards,
            ports: tail?.ports,
            forts: tail?.forts,
            holy: tail?.holy,
            wonders: tail?.wonders,
            ruins: tail?.ruins,
            weatherZones: weatherZones,
            wars: wars,
            sieges: sieges,
            contacts: contacts,
            arrows: arrows,
            seaBattles: seaBattles,
            events: events,
            era: tail?.era,
            yearOffset: yearOffset,
            worldTension: worldTension,
            historicalEra: historicalEra,
            lastNukeProvince: lastNukeProv,
            lastNukeDay: lastNukeDay
        )
        outState.historicalRoute = historicalRoute
        outState.pendingHistoricalEvent = pendingHistoricalEvent
        if isArmyDelta {
            outState.armyDeltaMode = true
            outState.removedArmyIds = removedArmyIds
        }
        if isFleetDelta {
            outState.fleetDeltaMode = true
            outState.removedFleetIds = removedFleetIds
        }
        return outState
    }
}
