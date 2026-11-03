import Foundation

/// The engine behind one request channel. The app calls it in-process (local play) or sends the same
/// requests to `LieguojiServer` on a computer (远程计算: the computer simulates, the phone only draws);
/// both run this one dispatcher, so the two modes cannot drift apart.
///
/// Wire form (the server): a request is a frame `[u32 header length][header JSON][u32 payload length]
/// [payload]` with header `{"call": name, "args": {…}}`; the reply is `[u32][header JSON][u32][data]
/// [u32][map]` with header `{"ok", "reason", "strings"?, "text"?, "points"?}`. Lengths are big-endian.
public final class EngineService {
    public private(set) var engine: NativeEngine?
    private var lastOwners: [Int] = []
    public init() {}

    public struct Reply {
        public var ok = true
        public var reason = ""
        public var data: Data?
        public var map: Data?
        public var strings: [String]?
        public var text: String?
        public var points: [[Double]]?
        public init(ok: Bool = true, reason: String = "", data: Data? = nil) { self.ok = ok; self.reason = reason; self.data = data }

        public func header() -> Data {
            var o: [String: Any] = ["ok": ok, "reason": reason]
            if let strings { o["strings"] = strings }
            if let text { o["text"] = text }
            if let points { o["points"] = points }
            return (try? JSONSerialization.data(withJSONObject: o)) ?? Data("{}".utf8)
        }
        public static func decode(header: Data, data: Data, map: Data) -> Reply {
            let o = (try? JSONSerialization.jsonObject(with: header)) as? [String: Any] ?? [:]
            var r = Reply(ok: o["ok"] as? Bool ?? false, reason: o["reason"] as? String ?? "", data: data.isEmpty ? nil : data)
            r.map = map.isEmpty ? nil : map
            r.strings = o["strings"] as? [String]; r.text = o["text"] as? String
            r.points = (o["points"] as? [[Any]])?.map { $0.compactMap { ($0 as? NSNumber)?.doubleValue } }
            return r
        }
    }

    /// The state for the views; nation labels only when ownership changed.
    func state() -> Data {
        guard let e = engine else { return Data() }
        let owners = e.run.world.provinces.asArray.map { p in e.run.world.nations.asArray.firstIndex { $0.id.asString == p.controller.asString } ?? -1 }
        let labels = owners != lastOwners
        lastOwners = owners
        return e.state(includeLabels: labels)
    }

    /// Runs one request. `payload` carries the world for `open` and the catalogues for `catalogs`.
    public func handle(_ call: String, _ args: [String: Any], payload: Data? = nil) -> Reply {
        func int(_ k: String) -> Int { (args[k] as? NSNumber)?.intValue ?? (args[k] as? Int) ?? -1 }
        func optInt(_ k: String) -> Int? { args[k] is NSNull || args[k] == nil ? nil : int(k) }
        func dbl(_ k: String) -> Double? { args[k] is NSNull ? nil : (args[k] as? NSNumber)?.doubleValue }
        func str(_ k: String) -> String { args[k] as? String ?? "" }
        func optStr(_ k: String) -> String? { args[k] as? String }
        func bool(_ k: String) -> Bool { (args[k] as? NSNumber)?.boolValue ?? (args[k] as? Bool) ?? false }
        func ints(_ k: String) -> [Int] { (args[k] as? [Any])?.compactMap { ($0 as? NSNumber)?.intValue } ?? [] }
        func strs(_ k: String) -> [String] { args[k] as? [String] ?? [] }
        func dbls(_ k: String) -> [Double] { (args[k] as? [Any])?.compactMap { ($0 as? NSNumber)?.doubleValue } ?? [] }
        func command(_ out: (ok: Bool, reason: String)?) -> Reply {
            guard let out else { return Reply(ok: false, reason: "世界尚未载入。") }
            return Reply(ok: out.ok, reason: out.reason, data: out.ok ? state() : nil)
        }
        func data(_ d: Data?) -> Reply { Reply(ok: d != nil, reason: d == nil ? "世界尚未载入。" : "", data: d) }

        switch call {
        case "ping": return Reply(reason: "列国纪远程计算")
        case "catalogs":
            guard let payload, let o = (try? JSONSerialization.jsonObject(with: payload)) as? [String: String],
                  let traits = o["traits"].flatMap({ Data(base64Encoded: $0) }), let noble = o["nobleCultures"].flatMap({ Data(base64Encoded: $0) }),
                  let cultures = o["cultures"].flatMap({ Data(base64Encoded: $0) }) else { return Reply(ok: false, reason: "目录数据缺失。") }
            do { try NativeEngine.loadCatalogs(traits: traits, nobleCultures: noble, cultures: cultures); return Reply() }
            catch { return Reply(ok: false, reason: error.localizedDescription) }
        case "open":
            guard let payload else { return Reply(ok: false, reason: "缺少世界数据。") }
            do {
                let e = try NativeEngine(world: payload)
                engine = e; lastOwners = []
                var r = Reply(data: state()); r.map = e.mapJSON; return r
            } catch { return Reply(ok: false, reason: error.localizedDescription) }
        case "isOpen": return Reply(ok: engine != nil)
        case "close": engine = nil; return Reply()
        case "step":
            engine?.advance(days: max(1, int("days")))
            return data(engine == nil ? nil : state())
        case "state": return data(engine == nil ? nil : state())
        case "order": return command(engine?.order(armyId: str("armyId"), provinceIndex: int("province")))
        case "retreat": return command(engine?.order(armyId: str("armyId"), provinceIndex: int("province"), retreat: true))
        case "politics": return command(engine?.politics(declare: bool("declare"), int("a"), int("b")))
        case "fleetOrder": return command(engine?.fleetOrder(fleetId: str("id"), provinceIndex: optInt("province")))
        case "province": return data(engine?.province(int("index")))
        case "nationInfo": return data(engine?.nationInfo(int("index")))
        case "view": return data(engine?.view(str("mode")))
        case "worldSettings": return data(engine?.worldSettings())
        case "setWorld": return command(engine?.setWorld(str("key"), int("value")))
        case "triggerCivilWar": return command(engine?.triggerCivilWar(int("n")))
        case "rts": return command(engine?.rtsOrder(armyIds: strs("armyIds"), nation: int("nation"), province: int("province"), defend: bool("defend")))
        case "nationHistory": return data(engine?.nationHistory(int("n")))
        case "territory": return command(engine?.territoryEdit(ints("provinces"), to: int("nation")))
        case "statistics": return data(engine?.statistics(str("category")))
        case "alliance": return command(engine?.alliance(int("a"), with: int("b")))
        case "releaseVassal": return command(engine?.releaseVassal(int("n")))
        case "makeVassal": return command(engine?.makeVassal(int("vassal"), of: int("overlord")))
        case "annex": return command(engine?.annex(int("target"), by: int("annexer")))
        case "setAutoDiplomacy": return command(engine?.setAutoDiplomacy(int("n"), enabled: bool("enabled")))
        case "route":
            var r = Reply(); r.points = engine?.route(armyId: str("armyId")) ?? []; return r
        case "save": return data(engine?.save())
        case "enableAppRules": engine?.enableAppRules(); return Reply()
        case "regime":
            let g: (history: [String], trait: String) = engine?.regime(int("n")) ?? (history: [], trait: "")
            var r = Reply(); r.strings = g.history; r.text = g.trait; return r
        case "editPerson": return command(engine?.editPerson(int("id"), skills: dbls("skills"), traits: strs("traits")))
        case "editIdentity": lastOwners = []; return command(engine?.editIdentity(int("n"), name: optStr("name"), color: optStr("color")))
        case "setCapital": lastOwners = []; return command(engine?.setCapital(int("n"), province: int("province")))
        case "editProvince": return command(engine?.editProvince(int("index"), population: dbl("population"), fortress: args["fortress"] is NSNull || args["fortress"] == nil ? nil : bool("fortress")))
        case "setTemper": return command(engine?.setTemper(int("n"), dbl("value")))
        case "renamePerson": return command(engine?.renamePerson(int("id"), first: optStr("first"), last: optStr("last"), age: optInt("age")))
        case "editNation": return command(engine?.editNation(int("n"), gold: dbl("gold"), destiny: dbl("destiny"), polity: optStr("polity"), culture: optStr("culture"), religion: optStr("religion")))
        case "setStyle": return command(engine?.setStyle(int("n"), style: str("style")))
        case "treaty": return command(engine?.treaty(int("a"), int("b"), years: int("years"), kind: str("kind")))
        case "gift": return command(engine?.gift(int("from"), to: int("to"), gold: dbl("gold") ?? 0))
        case "posts": return data(engine?.posts(int("n")))
        case "postCandidates": return data(engine?.postCandidates(int("n"), post: str("post")))
        case "appointPost": return command(engine?.appointPost(int("n"), post: str("post"), personId: int("person")))
        case "officeCandidates": return data(engine?.officeCandidates(int("n"), office: str("office")))
        case "appointOffice": return command(engine?.appointOffice(int("n"), office: str("office"), personId: int("person")))
        case "setCourtManual": return command(engine?.setCourtManual(int("n"), manual: bool("manual")))
        case "addArmy": return command(engine?.addArmy(int("n"), province: int("province")))
        case "editArmy": return command(engine?.editArmy(str("armyId"), troops: optInt("troops"), unit: optStr("unit"), morale: dbl("morale")))
        default: return Reply(ok: false, reason: "未知请求 \(call)。")
        }
    }
}

/// 自动接入: the room this player's phone and computer meet in without typing anything (built into both
/// the app and the server; a pairing.txt next to the server overrides it).
public enum RemoteRoom {
    public static let personal = "ECZV5UL3UV"
    public static let port: UInt16 = 8765
}

/// Frame helpers shared by the server and the app's remote link.
public enum EngineWire {
    public static func u32(_ n: Int) -> Data { var v = UInt32(n).bigEndian; return Data(bytes: &v, count: 4) }
    public static func readU32(_ d: Data, at i: Int) -> Int { d[d.startIndex + i..<d.startIndex + i + 4].reduce(0) { $0 << 8 | Int($1) } }
    public static func request(_ call: String, _ args: [String: Any], payload: Data?) -> Data {
        let header = (try? JSONSerialization.data(withJSONObject: ["call": call, "args": args])) ?? Data("{}".utf8)
        var out = u32(header.count); out.append(header)
        let p = payload ?? Data(); out.append(u32(p.count)); out.append(p)
        return out
    }
    public static func reply(_ r: EngineService.Reply) -> Data {
        let header = r.header(), data = r.data ?? Data(), map = r.map ?? Data()
        var out = u32(header.count); out.append(header)
        out.append(u32(data.count)); out.append(data)
        out.append(u32(map.count)); out.append(map)
        return out
    }
}
