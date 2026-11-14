import Foundation

/// 元首与掌权者 (本作规则): a form of government names two seats, not one. The head of state reigns
/// (皇帝、国王、天皇、总统、主席); where the form has one, a head of government runs the state
/// (首相、总理、丞相、征夷大将军、摄政王). In a constitutional monarchy, a parliamentary republic, a
/// shogunate or a regency it is the second who holds power, and the first reigns on while cabinets
/// come and go. The head of government is the engine's own Chancellor office under the form's title.
extension Regimes {
    public struct Seats: Equatable {
        /// The head of state's title where the form sets one; nil keeps the engine's title.
        public let head: String?
        /// The head of government's title; nil where the head of state governs alone.
        public let premier: String?
        /// The head of government, not the head of state, holds power.
        public let premierRules: Bool
        /// The head of government is chosen at the general election and falls with his cabinet.
        public let elected: Bool
    }

    /// The chief minister of a crown that governs itself, by culture.
    static func minister(_ culture: String) -> String {
        switch culture {
        case "chinese", "vietnamese": return "丞相"
        case "japanese": return "关白"
        case "korean": return "领议政"
        case "arab", "persian", "turkic", "egyptian": return "维齐尔"
        case "mongol": return "断事官"
        default: return "宰相"
        }
    }

    static func seats(_ r: JS, _ id: String) -> Seats {
        let civ = r.civilization.nations[id], culture = civ.cultureId.optionalString ?? "", polity = civ.polity.optionalString ?? "Kingdom"
        let s = style(r, id)
        func crown(_ base: String) -> String { People.rulerTitle(culture: culture, polity: base, religion: civ.religionId.optionalString ?? "", gender: 0) }
        switch s.id {
        case "constitutional":
            // 君主立宪: the crown reigns, the prime minister governs.
            return Seats(head: sovereign(r, id, culture == "japanese" ? "天皇" : crown("Kingdom")), premier: culture == "chinese" ? "内阁总理" : culture == "german" ? "宰相" : "首相", premierRules: true, elected: true)
        case "union":
            return Seats(head: crown("Kingdom"), premier: "首相", premierRules: true, elected: true)
        case "parliamentary":
            // 议会共和: a president for the state, a premier for the government.
            return Seats(head: "总统", premier: "总理", premierRules: true, elected: true)
        case "shogunate":
            return Seats(head: sovereign(r, id, crown("Empire")), premier: "征夷大将军", premierRules: true, elected: false)
        case "regency":
            return Seats(head: crown("Kingdom"), premier: "摄政王", premierRules: true, elected: false)
        case "communist":
            return Seats(head: "主席", premier: "总理", premierRules: false, elected: false)
        case "socialist":
            return Seats(head: "总书记", premier: "部长会议主席", premierRules: false, elected: false)
        case "sultanate", "caliphate":
            return Seats(head: nil, premier: "大维齐尔", premierRules: false, elected: false)
        case "papacy":
            return Seats(head: nil, premier: "国务枢机", premierRules: false, elected: false)
        case "empire", "despotism", "dynasty":
            return Seats(head: sovereign(r, id, s.title ?? crown(polity)), premier: minister(culture), premierRules: false, elected: false)
        case "absolute", "feudal", "elective", "principality", "tsardom":
            return Seats(head: nil, premier: minister(culture), premierRules: false, elected: false)
        default:
            // 总统共和、联邦、独裁、军政府、部落、神权…: one seat.
            return Seats(head: nil, premier: nil, premierRules: false, elected: false)
        }
    }

    /// 天皇只有一位: among the living Japanese crowns only the eldest state's sovereign is 天皇; a
    /// younger one is a 大王. The exception is 南北朝: two courts at war with each other both claim it.
    static func sovereign(_ r: JS, _ id: String, _ title: String) -> String {
        guard title == "天皇" else { return title }
        func claims(_ other: String) -> Bool {
            let c = r.civilization.nations[other]
            guard !c.isNull, c.cultureId.optionalString == "japanese", Vassals.alive(r, other) else { return false }
            let polity = c.polity.optionalString ?? "", st = style(r, other).id
            return polity == "Empire" || st == "constitutional"
        }
        for n in r.world.nations.asArray {
            let other = n.id.asString
            if other == id { return title }          // nobody senior: this is the one
            if claims(other) && !atWar(r, id, other) { return "大王" }
        }
        return title
    }
    static func atWar(_ r: JS, _ a: String, _ b: String) -> Bool {
        let relations = r.world.statecraft.relations
        guard !relations.isNull else { return false }
        return relations.asArray.contains { x in
            x.status.optionalString == "war" && ((x.a.optionalString == a && x.b.optionalString == b) || (x.a.optionalString == b && x.b.optionalString == a))
        }
    }

    /// The head of government: the Chancellor's holder.
    static func premier(_ r: JS, _ id: String) -> JS? { Offices.holder(r, id, "Chancellor", Offices.stateId(r, id)) }

    static func personName(_ p: JS) -> String {
        if let name = p.identity.name.optionalString { return name }
        let culture = p.cultureName.optionalString ?? "", first = p.firstName.optionalString ?? "", last = p.lastName.optionalString ?? ""
        return culture == "chinese" || culture == "japanese" || culture == "korean" || culture == "vietnamese" ? last + first : last.isEmpty ? first : first + "·" + last
    }

    /// 组阁与倒阁, each month, where the head of government is elected: at the general election the
    /// majority names him; when the state does badly a vote of no confidence may bring him down between
    /// elections. The head of state is never touched: the crown (or the president) reigns on.
    static func cabinet(_ r: JS, _ n: JS, _ id: String, _ key: Int) {
        let seat = seats(r, id)
        guard seat.elected, let title = seat.premier, !Offices.book(r, id).manual.isTruthy else { return }
        let sid = Offices.stateId(r, id), current = premier(r, id), head = ruler(r, id)
        let election = key % 48 == sid % 48
        let fall = !election && current != nil && mood(r, id) < -0.35 && chance("\(id)|\(key)|cabinet") < 0.04
        guard election || fall || current == nil else { return }
        let all = People.electionFamilies(r, id).filter { $0.k.stateId.asInt == sid }
        // The reigning house does not sit in the cabinet where another house can.
        let commons = all.filter { $0.k.id.asInt != (head?.familyId.asInt ?? -1) }
        let barred = fall ? (current?.id.asInt ?? 0) : (head?.id.asInt ?? 0)
        guard let next = People.republicLeader(r, families: commons.isEmpty ? all : commons, excluding: barred),
              next.id.asInt != (head?.id.asInt ?? -1), next.id.asInt != (current?.id.asInt ?? -1) else { return }
        Offices.appoint(Offices.context(r, id), "Chancellor", 0, sid, next.id.asInt)
        let state = n.name.asString, who = personName(next), reigning = seat.head ?? "元首"
        if fall, let current {
            _ = People.announce(r, kind: "politics", text: "\(state)倒阁：\(title)\(personName(current))去职，\(who)组阁",
                                reason: "国势不振、民怨沸腾，议会通过不信任案，内阁总辞；\(reigning)在位如故。", nations: [id], province: nil)
        } else {
            _ = People.announce(r, kind: "politics", text: "\(who)出任\(state)\(title)",
                                reason: (election ? "大选之后，议会多数推举\(title)组阁，掌理国政；" : "\(title)出缺，议会推举新阁；") + "\(reigning)在位如故。", nations: [id], province: nil)
        }
    }
}
