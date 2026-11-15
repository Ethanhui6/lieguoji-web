import Foundation

/// 占领与战场墨晕：由军队的实际位置与移动驱动。
///
/// - 军队进入一个州（所在州变了）的那一步就记下它的入境点（上一步位置与这一步位置的中点，即越过州界处），
///   墨色从这一侧洇进来，不等交战或围城开始。
/// - 州内没有敌方军队：只有进入的一方，墨色从入境方向铺开，覆盖面随占领进度增长，易主时铺满后淡去。
/// - 州内有敌对的各方：按交战关系分营，每营从自己的方向（进攻方是入境方向，守军是其所在位置，
///   守在中央时取进攻方的对面）推进，分界按兵力占比；多方按方向与兵力分区。
/// - 撤出、溃散、援军加入都在下一步的目标里体现，渲染端只做平滑过渡（`ease`）。
///
/// 只在每步推演后计算一次（与界面状态同频），渲染端每帧只插值。
public struct InkGround: Equatable, Sendable {
    public struct Camp: Equatable, Sendable {
        /// 该营代表国（兵力最多的一国）。
        public let nation: Int
        /// 从州中心指向该营来向的单位向量。
        public let direction: SIMD2<Float>
        public let troops: Float
        /// 覆盖面目标（0…1）：1 为铺满整州，交战各营均为 1，单方占领随进度增长。
        public let reach: Float
        public init(nation: Int, direction: SIMD2<Float>, troops: Float, reach: Float) {
            self.nation = nation; self.direction = direction; self.troops = troops; self.reach = reach
        }
    }
    public let province: Int
    public let camps: [Camp]
    /// 交战（多营）或单方占领。
    public var contested: Bool { camps.count >= 2 }
    public var troops: Float { camps.reduce(0) { $0 + $1.troops } }
    public init(province: Int, camps: [Camp]) { self.province = province; self.camps = camps }
}

public final class InkFront {
    /// 每个州的中心与半径（与渲染端的州网格包围盒一致）。
    public struct Disk: Equatable, Sendable { public let center: SIMD2<Float>; public let radius: Float }
    private struct Seen { let province: Int; let at: SIMD2<Float>; let entry: SIMD2<Float> }
    private var seen = [String: Seen]()
    /// 刚进入、尚未开始围城的一方先铺开的覆盖面（一步之内即可看见）。
    public static let entryReach: Float = 0.16

    public init() {}
    /// 换世界或读档：不沿用旧世界的入境点。
    public func reset() { seen = [:] }

    /// 州的中心与半径：各州陆地格的包围盒。
    public static func disks(_ map: WorldMap) -> [Disk] {
        let count = map.meta.provinces.count
        var lo = [SIMD2<Float>](repeating: SIMD2(.infinity, .infinity), count: count), hi = [SIMD2<Float>](repeating: SIMD2(-.infinity, -.infinity), count: count)
        for c in 0..<map.cellCount {
            let p = Int(map.province[c])
            guard p >= 0, p < count, map.isLand(c) else { continue }
            for v in Int(map.offsets[c])..<Int(map.offsets[c + 1]) {
                let x = map.vertices[v * 2], y = map.vertices[v * 2 + 1]
                lo[p] = SIMD2(min(lo[p].x, x), min(lo[p].y, y)); hi[p] = SIMD2(max(hi[p].x, x), max(hi[p].y, y))
            }
        }
        return (0..<count).map { p in
            guard lo[p].x.isFinite else { let q = map.meta.provinces[p]; return Disk(center: SIMD2(q.x, q.y), radius: 1) }
            return Disk(center: (lo[p] + hi[p]) / 2, radius: max(hi[p].x - lo[p].x, hi[p].y - lo[p].y) / 2)
        }
    }

    private static func length(_ v: SIMD2<Float>) -> Float { (v.x * v.x + v.y * v.y).squareRoot() }

    /// 新的一步：返回每个有墨晕的州（兵力大者在前）。
    public func update(_ s: GameState, disks: [Disk]) -> [InkGround] {
        var next = [String: Seen](minimumCapacity: s.armies.count)
        var present = [Int: [(nation: Int, troops: Float, entry: SIMD2<Float>, at: SIMD2<Float>)]]()
        for a in s.armies where a.troops > 0 && a.status != "destroyed" && a.province >= 0 && a.province < disks.count {
            let here = SIMD2<Float>(a.x, a.y)
            var entry = here
            if let old = seen[a.id] {
                // 同一州里沿用入境点；换了州则取越界处（两步位置的中点）。
                entry = old.province == a.province ? old.entry : (old.at + here) / 2
            }
            next[a.id] = Seen(province: a.province, at: here, entry: entry)
            present[a.province, default: []].append((a.nation, Float(max(1, a.troops)), entry, here))
        }
        seen = next
        var progress = [Int: Double]()
        for g in s.sieges where g.province >= 0 { progress[g.province] = max(progress[g.province] ?? 0, 1 - min(1, max(0, g.progress))) }
        var out = [InkGround]()
        for (province, list) in present {
            let owner = province < s.owners.count ? s.owners[province] : -1
            // 分营：互不交战的国家同营（盟军合营），兵力多者为代表。
            var troops = [Int: Float]()
            for x in list { troops[x.nation, default: 0] += x.troops }
            var camps = [(lead: Int, members: [Int])]()
            for n in troops.keys.sorted(by: { troops[$0]! != troops[$1]! ? troops[$0]! > troops[$1]! : $0 < $1 }) {
                if let k = camps.firstIndex(where: { camp in !camp.members.contains { s.atWar(n, $0) } }) { camps[k].members.append(n) } else { camps.append((n, [n])) }
            }
            let disk = disks[province]
            // 无主之地只有真在围城（有占领进度）时才算占领，路过或驻扎不留墨。
            func hostile(_ members: [Int]) -> Bool { members.contains { $0 != owner && (owner < 0 ? progress[province] != nil : s.atWar($0, owner)) } }
            if camps.count == 1 {
                // 单方：只有与州主交战的一方才是在占领。
                guard owner != camps[0].lead, hostile(camps[0].members) else { continue }
            }
            // 每营的来向：进攻方取入境点，守军（州主一方）取所在位置。
            var raw = [(lead: Int, troops: Float, toward: SIMD2<Float>, home: Bool)]()
            for camp in camps {
                var t: Float = 0, sum = SIMD2<Float>(0, 0)
                let home = camp.members.contains(owner)
                for x in list where camp.members.contains(x.nation) {
                    t += x.troops
                    sum += ((home && x.nation == owner) ? x.at : x.entry) * x.troops
                }
                raw.append((camp.lead, t, sum / max(1, t) - disk.center, home))
            }
            // 来向不明（站在州心）：守军取进攻方的对面，其余按营序均分方向。
            let attackers = raw.filter { !$0.home }.reduce(SIMD2<Float>(0, 0)) { $0 + $1.toward * $1.troops }
            var result = [InkGround.Camp]()
            for (i, c) in raw.enumerated() {
                var dir = c.toward
                if Self.length(dir) < disk.radius * 0.2 {
                    if c.home, Self.length(attackers) > 0.001 { dir = -attackers }
                    else { let a = Float(i) * 2 * .pi / Float(max(2, raw.count)) + Float(c.lead % 7) * 0.3; dir = SIMD2(cos(a), sin(a)) }
                }
                dir /= max(0.0001, Self.length(dir))
                let reach: Float = raw.count >= 2 ? 1 : Float(min(1, Double(Self.entryReach) + (1 - Double(Self.entryReach)) * (progress[province] ?? 0)))
                result.append(.init(nation: c.lead, direction: dir, troops: c.troops, reach: reach))
            }
            out.append(InkGround(province: province, camps: result))
        }
        return out.sorted { $0.troops != $1.troops ? $0.troops > $1.troops : $0.province < $1.province }
    }

    /// 渲染端的平滑过渡：按时间常数逼近目标（与帧率无关）。新出现的墨晕用较短的时间常数，入境即见。
    public static func ease(_ value: Float, toward target: Float, seconds: Float, tau: Float) -> Float {
        value + (target - value) * (1 - exp(-max(0, seconds) / max(0.001, tau)))
    }
}
