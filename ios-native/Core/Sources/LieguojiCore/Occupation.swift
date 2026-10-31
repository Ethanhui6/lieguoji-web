import Foundation

/// Province sieges and capture (war47-occupation advanceOwnedTacticsOccupation47): hostile armies
/// standing on enemy land open a siege at the province's resistance capacity; each due army strikes
/// the resistance (defenders repair it); at zero the strongest besieger takes the province. With the
/// web's empty-town rule a province with no defending army is taken on arrival.
public struct OccupationWorld: Codable, Sendable, Equatable {
    public struct Army: Codable, Sendable, Equatable {
        public var id: String; public var nation: Int; public var province: Int; public var status: String
        /// Province combat values (civilization47-combat province reader) and the blockade multiplier.
        public var efficiency: Double; public var damageToProvince: Double; public var multiplier: Int
    }
    public struct Siege: Codable, Sendable, Equatable {
        public var province: Int; public var controller: Int; public var attacker: Int
        public var maximum: Double; public var resistance: Double; public var started: Int; public var pulse: Int
    }
    public var tick: Int
    public var nationIds: [String]
    public var owners: [Int]
    public var wars: [[Int]]
    public var armies: [Army]
    public var sieges: [Siege]
    public var capacity: [Double]
    public var unopposed: String

    public func atWar(_ a: Int, _ b: Int) -> Bool { a != b && wars.contains { $0[0] == a && $0[1] == b || $0[0] == b && $0[1] == a } }

    /// One pass over every province. Returns the captures in order (province, capturing army or nil).
    public mutating func advance(due: Set<String>) -> [(province: Int, army: String?)] {
        // reconcileOccupation: drop sieges whose province changed hands or whose war ended.
        sieges = sieges.filter { owners.indices.contains($0.province) && owners[$0.province] == $0.controller && atWar($0.attacker, $0.controller) }
        var local = [Int: [Int]]()
        for (i, a) in armies.enumerated() where a.province >= 0 && a.status != "retreating" { local[a.province, default: []].append(i) }
        var captures = [(province: Int, army: String?)]()
        let f = Native.fr
        for p in owners.indices {
            let group = local[p] ?? []
            var k = sieges.firstIndex { $0.province == p }
            if k == nil && !group.contains(where: { atWar(armies[$0].nation, owners[p]) }) { continue }
            // forcesFromGroup: the strongest hostile nation (ties by nation id) against the defenders.
            var powers = [Int: Double](), order = [Int]()
            for i in group {
                let a = armies[i], e = a.efficiency * Double(a.multiplier)
                if a.nation != owners[p] && atWar(a.nation, owners[p]) { if powers[a.nation] == nil { order.append(a.nation) }; powers[a.nation, default: 0] += e }
            }
            let rank = order.sorted { x, y in powers[x]! != powers[y]! ? powers[x]! > powers[y]! : Collate.less(nationIds[x], nationIds[y]) }
            let attacker = rank.first
            if attacker == nil && k == nil { continue }
            let attackers = group.filter { armies[$0].nation == attacker }
            let defenders = group.filter { attacker != nil && armies[$0].nation != attacker && atWar(armies[$0].nation, attacker!) }
            let immediate = unopposed == "takeover" && !attackers.isEmpty && defenders.isEmpty
            if k == nil, let attacker {
                let m = capacity[p]
                sieges.append(Siege(province: p, controller: owners[p], attacker: attacker, maximum: m, resistance: m, started: tick, pulse: tick))
                k = sieges.count - 1
            }
            guard let s = k else { continue }
            if let attacker { sieges[s].attacker = attacker }
            var conqueror: Int? = immediate ? attacker : nil
            var captor: String? = immediate ? attackers.map { armies[$0].id }.sorted(by: Collate.less).first : nil
            if immediate { sieges[s].resistance = 0 }
            else {
                for i in group.filter({ due.contains(armies[$0].id) }).sorted(by: { Collate.less(armies[$0].id, armies[$1].id) }) {
                    let a = armies[i]
                    let base = f(a.damageToProvince * a.efficiency), damage = a.multiplier == 2 ? f(f(base) * 2) : base
                    if a.nation == owners[p] { sieges[s].resistance = min(sieges[s].maximum, sieges[s].resistance + damage) }
                    else if atWar(a.nation, owners[p]) { sieges[s].attacker = a.nation; sieges[s].resistance = max(0, sieges[s].resistance - damage) }
                    sieges[s].pulse = tick
                    if sieges[s].resistance == 0 { conqueror = a.nation; captor = a.id; break }
                }
            }
            if sieges[s].resistance == 0, let next = conqueror {
                owners[p] = next
                captures.append((p, captor))
                sieges.remove(at: s)
            } else if attacker == nil && sieges[s].resistance == sieges[s].maximum {
                sieges.remove(at: s)
            }
        }
        return captures
    }
}
