import SwiftUI
import LieguojiCore

/// 军团信息 (engine armyRecord): where an army was raised, its service, battles and the enemies it struck down.
struct ArmyService: Decodable {
    let home: Int; let days: Double; let full: Double; let levy: Bool
    let kills: Double; let losses: Double; let battles: Double; let reason: String
    /// 军功等级 0…3.
    var rank: Int? = nil
    var campaigns: Double? = nil; var campaign: String? = nil
}

/// The original's army status line (休整待命 / 前往进攻 / 前往防守 / 在海洋中航行) and the army's record.
struct ArmyServiceView: View {
    @ObservedObject var model: GameModel
    let army: GameState.Army
    @State private var record: ArmyService?
    static func status(_ a: GameState.Army, _ state: GameState?, _ map: WorldMap) -> String {
        if a.status == "fighting" { return "交战中" }
        if a.status == "retreating" { return "撤退中" }
        if a.province < 0 && a.travel == "moving" { return "在海洋中航行" }
        if let d = a.destination, d >= 0, d < map.meta.provinces.count, a.travel == "moving" || a.travel == "blocked" {
            let owner = state.flatMap { $0.owners.indices.contains(d) ? $0.owners[d] : nil } ?? -1
            let enemies = state.flatMap { $0.nations.indices.contains(a.nation) ? $0.nations[a.nation].enemies : nil } ?? []
            return (enemies.contains(owner) ? "前往进攻" : "前往防守") + map.meta.provinces[d].name
        }
        return a.travel == "moving" ? "行军中" : "休整待命"
    }
    static func served(_ days: Double) -> String {
        let d = Int(days), y = d / 360, m = d % 360 / 30
        return y > 0 ? "\(y)年\(m > 0 ? "\(m)个月" : "")" : m > 0 ? "\(m)个月" : "\(d)天"
    }
    var body: some View {
        if let map = model.map {
            Group2 {
                Row(label: "当前状态", value: Self.status(army, model.state, map)); Divider2()
                if let r = record {
                    Row(label: "征召于", value: map.meta.provinces.indices.contains(r.home) ? map.meta.provinces[r.home].name + (r.levy ? "（动员）" : "") : "—"); Divider2()
                    Row(label: "服役", value: Self.served(r.days)); Divider2()
                    Row(label: "满编", value: Names.wan(Int(r.full))); Divider2()
                    if let c = r.campaign, !c.isEmpty { Row(label: "当前战役", value: c); Divider2() }
                    Row(label: "军功", value: ["新军", "劲旅 · 攻+6% 受伤−4%", "精锐 · 攻+12% 受伤−8%", "百战之师 · 攻+18% 受伤−12%"][min(3, max(0, r.rank ?? 0))]); Divider2()
                    Row(label: "参战", value: "\(Int(r.battles)) 次 · 战役 \(Int(r.campaigns ?? 0)) 场"); Divider2()
                    Row(label: "战史共歼灭敌军", value: "\(Names.wan(Int(r.kills))) 人"); Divider2()
                    Row(label: "折损", value: "\(Names.wan(Int(r.losses))) 人")
                    if !r.reason.isEmpty && !army.manual {
                        Divider2()
                        Text(r.reason).font(Theme.kai(13)).foregroundStyle(Theme.ink2).frame(maxWidth: .infinity, alignment: .leading)
                            .padding(.horizontal, 16).padding(.vertical, 9)
                    }
                }
            }
            .padding(.horizontal, 16)
            .task(id: "\(army.id)-\(model.state?.day ?? 0)") { record = await model.armyRecord(army.id) }
        }
    }
}

/// 对阵图: the two sides of a province's battle or siege — their states, armies, troops and morale, and
/// the balance of strength as one bar. Shown on the province and on an army in the fight.
struct BattleBoard: View {
    let province: Int
    let state: GameState
    let map: WorldMap
    var openArmy: ((Int) -> Void)? = nil
    private func name(_ n: Int) -> String { n >= 0 && n < map.meta.nations.count ? map.meta.nations[n].name : "?" }
    private func tint(_ n: Int) -> Color { n >= 0 && n < map.meta.nations.count ? Names.color(map.meta.nations[n].color) : Theme.ink2 }
    /// The army whose page shows this board: its own clash comes first.
    var focusNation: Int = -1
    typealias Entry = EnumeratedSequence<[GameState.Army]>.Element
    /// One clash in the province: an anchor state (the owner when it is attacked) with its allies here,
    /// against the states here at war with it. Armies of several wars in one province give several
    /// clashes; armies at peace with everyone here stand aside.
    struct Clash { let anchor: Int; let owner: Bool; let defend: [Entry]; let attack: [Entry] }
    static func clashes(_ here: [Entry], owner: Int, state: GameState, focus: Int) -> [Clash] {
        func enemies(_ n: Int) -> Set<Int> { state.nations.indices.contains(n) ? Set(state.nations[n].enemies) : [] }
        var troops = [Int: Int]()
        for e in here { troops[e.element.nation, default: 0] += e.element.troops }
        var left = Set(troops.keys), out = [Clash](), ownerUsed = false
        while true {
            var anchor: Int?
            if !ownerUsed, owner >= 0, !left.intersection(enemies(owner)).isEmpty { anchor = owner; ownerUsed = true }
            else {
                let hot = left.filter { !left.intersection(enemies($0)).isEmpty }
                if hot.isEmpty { break }
                anchor = hot.contains(focus) ? focus : hot.max { (troops[$0] ?? 0, -$0) < (troops[$1] ?? 0, -$1) }
            }
            guard let a = anchor else { break }
            let foes = left.intersection(enemies(a))
            if foes.isEmpty { left.remove(a); continue }
            let friends = left.filter { $0 == a || (!foes.contains($0) && !enemies($0).isDisjoint(with: foes) && !enemies(a).contains($0)) }
            left.subtract(foes); left.subtract(friends)
            out.append(Clash(anchor: a, owner: a == owner, defend: here.filter { friends.contains($0.element.nation) }, attack: here.filter { foes.contains($0.element.nation) }))
        }
        if focus >= 0, let i = out.firstIndex(where: { c in (c.defend + c.attack).contains { $0.element.nation == focus } }), i > 0 { out.insert(out.remove(at: i), at: 0) }
        return out
    }
    var body: some View {
        let here = state.armies.enumerated().filter { $0.element.province == province && $0.element.troops > 0 }
        let owner = state.owners.indices.contains(province) ? state.owners[province] : -1
        let list = Self.clashes(Array(here), owner: owner, state: state, focus: focusNation)
        VStack(spacing: 10) {
            ForEach(Array(list.enumerated()), id: \.offset) { _, c in card(c) }
        }
    }
    @ViewBuilder private func card(_ c: Clash) -> some View {
        let attackers = c.attack, defenders = c.defend
        let a = attackers.reduce(0) { $0 + $1.element.troops }, d = defenders.reduce(0) { $0 + $1.element.troops }
        let fighting = (attackers + defenders).contains { $0.element.status == "fighting" }
        let attackerNation = attackers.max { $0.element.troops < $1.element.troops }!.element.nation
        let allies = Set(defenders.map(\.element.nation)).subtracting([c.anchor]).count
        VStack(spacing: 10) {
            HStack(spacing: 8) {
                Image(systemName: "flag.2.crossed.fill").font(.system(size: 15, weight: .regular)).foregroundStyle(Theme.seal)
                    .symbolEffect(.pulse, isActive: fighting)
                Text(c.owner ? "对阵" : "遭遇").font(Theme.kai(18)).foregroundStyle(Theme.ink)
                Spacer()
                PaperTag(text: fighting ? "交战中" : c.owner && defenders.isEmpty ? "围城中" : "对峙中", color: fighting ? Theme.seal : Theme.ink2, size: 13)
            }
            // Each side's name and strength, and the balance between them.
            HStack(alignment: .firstTextBaseline) {
                VStack(alignment: .leading, spacing: 2) {
                    Text((c.owner ? "守 · " : "") + name(c.anchor) + (allies > 0 ? "与盟军" : "")).font(Theme.kai(15)).foregroundStyle(Theme.ink).lineLimit(1)
                    Text(defenders.isEmpty ? "仅余城防" : "\(Names.wan(d)) 兵").font(Theme.kai(13)).foregroundStyle(Theme.ink2).monospacedDigit()
                }
                Spacer()
                VStack(alignment: .trailing, spacing: 2) {
                    Text((c.owner ? "攻 · " : "") + name(attackerNation) + (Set(attackers.map(\.element.nation)).count > 1 ? "等" : "")).font(Theme.kai(15)).foregroundStyle(Theme.ink).lineLimit(1)
                    Text("\(Names.wan(a)) 兵").font(Theme.kai(13)).foregroundStyle(Theme.ink2).monospacedDigit()
                }
            }
            GeometryReader { g in
                let total = max(1, a + d), left = g.size.width * CGFloat(d) / CGFloat(total)
                HStack(spacing: 2) {
                    Rectangle().fill(tint(c.anchor)).frame(width: max(d > 0 ? 6 : 0, left - 1))
                    Rectangle().fill(tint(attackerNation))
                }
                .clipShape(Capsule())
                .animation(.spring(response: 0.6, dampingFraction: 0.85), value: d)
                .animation(.spring(response: 0.6, dampingFraction: 0.85), value: a)
            }
            .frame(height: 8)
            HStack(alignment: .top, spacing: 10) {
                column(defenders, empty: c.owner ? "无野战守军" : "")
                Rectangle().fill(Theme.ink.opacity(0.1)).frame(width: 0.8)
                column(attackers, empty: "")
            }
        }
        .padding(14)
        .paperCard(tint: Theme.seal)
        .padding(.horizontal, 16)
        .transition(.scale(scale: 0.96).combined(with: .opacity))
    }
    private func column(_ list: [EnumeratedSequence<[GameState.Army]>.Element], empty: String) -> some View {
        VStack(alignment: .leading, spacing: 7) {
            if list.isEmpty { Text(empty).font(Theme.kai(13)).foregroundStyle(Theme.ink2) }
            ForEach(list.prefix(6), id: \.element.id) { item in
                let x = item.element
                Button { openArmy?(item.offset) } label: {
                    HStack(spacing: 7) {
                        UnitMark(unit: x.unit, color: tint(x.nation)).frame(width: 24, height: 24)
                        VStack(alignment: .leading, spacing: 2) {
                            Text(x.name).font(Theme.kai(13)).foregroundStyle(Theme.ink).lineLimit(1)
                            HStack(spacing: 4) {
                                Text(Names.wan(x.troops)).font(Theme.kai(12)).foregroundStyle(Theme.ink2).monospacedDigit()
                                Capsule().fill(Theme.ink.opacity(0.12)).frame(width: 34, height: 3)
                                    .overlay(alignment: .leading) { Capsule().fill(x.morale < 30 ? Theme.seal : Theme.jade).frame(width: 34 * CGFloat(min(100, max(0, x.morale))) / 100, height: 3) }
                            }
                        }
                    }
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain).disabled(openArmy == nil)
            }
            if list.count > 6 { Text("另有 \(list.count - 6) 军").font(Theme.kai(12)).foregroundStyle(Theme.ink2) }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}

/// 战争状态, 城市防御力 / 占领进度 and 生物群系分布 of a province.
struct ProvinceWarView: View {
    let info: ProvinceInfo
    let owner: Int
    let state: GameState?
    let map: WorldMap
    static let biomeNames = ["海滨", "炎热荒漠", "寒冷荒漠", "稀树草原", "草原", "热带季雨林", "温带森林", "热带雨林", "温带雨林", "针叶林", "苔原", "冰川", "沼泽"]
    var body: some View {
        let enemies = state.flatMap { $0.nations.indices.contains(owner) ? $0.nations[owner].enemies : nil } ?? []
        Group2 {
            Row(label: "战争状态", value: enemies.isEmpty ? "和平中" : "与\(enemies.count)国交战"); Divider2()
            Row(label: "城市防御力", value: "\(Int(info.defense ?? 1)) 级")
            ForEach(Array((info.sieges ?? []).enumerated()), id: \.offset) { _, s in
                Divider2()
                let who = s.nation >= 0 && s.nation < map.meta.nations.count ? map.meta.nations[s.nation].name : "敌军"
                let done = s.maximum > 0 ? max(0, min(1, 1 - s.resistance / s.maximum)) : 0
                VStack(alignment: .leading, spacing: 6) {
                    HStack {
                        Text("\(who)围城 · 占领进度").font(Theme.kai(16)).foregroundStyle(Theme.ink2)
                        Spacer()
                        Text("\(Int((done * 100).rounded()))%").font(Theme.kai(16)).foregroundStyle(Theme.seal).monospacedDigit()
                    }
                    GeometryReader { g in
                        ZStack(alignment: .leading) {
                            Capsule().fill(Theme.ink.opacity(0.12))
                            Capsule().fill(Theme.seal).frame(width: g.size.width * CGFloat(done))
                        }
                    }
                    .frame(height: 5)
                    Text("城防余 \(Int(s.resistance.rounded()))／\(Int(s.maximum.rounded()))").font(Theme.kai(12)).foregroundStyle(Theme.ink2)
                }
                .padding(.horizontal, 16).padding(.vertical, 9)
            }
            let biomes = (info.biomes ?? []).enumerated().filter { $0.element > 0.01 }.sorted { $0.element > $1.element }
            if !biomes.isEmpty {
                Divider2()
                VStack(alignment: .leading, spacing: 6) {
                    Text("生物群系分布").font(Theme.kai(16)).foregroundStyle(Theme.ink2)
                    ForEach(biomes, id: \.offset) { b in
                        HStack(spacing: 8) {
                            Text(b.offset < Self.biomeNames.count ? Self.biomeNames[b.offset] : "其他").font(Theme.kai(14)).foregroundStyle(Theme.ink).frame(width: 78, alignment: .leading)
                            GeometryReader { g in Capsule().fill(Theme.ink.opacity(0.55)).frame(width: max(2, g.size.width * CGFloat(min(1, b.element)))) }.frame(height: 5)
                            Text("\(Int((b.element * 100).rounded()))%").font(Theme.kai(13)).foregroundStyle(Theme.ink2).monospacedDigit().frame(width: 40, alignment: .trailing)
                        }
                    }
                }
                .padding(.horizontal, 16).padding(.vertical, 9)
            }
        }
        .padding(.horizontal, 16)
    }
}

/// A small icon for a row or tile by its label, so every page reads at a glance. The first keyword
/// found wins (the more specific ones come first).
enum Glyph {
    static let table: [(String, String)] = [
        // 分页 (every tab bar).
        ("概览", "doc.text.magnifyingglass"), ("朝政", "building.columns"), ("军事", "shield.lefthalf.filled"), ("自定义", "slider.horizontal.3"),
        ("游戏", "gamecontroller"), ("地图显示", "map"), ("声音与其他", "speaker.wave.2"), ("全部", "square.grid.2x2"), ("交战围城", "flag.2.crossed"), ("战局", "map"),
        ("亲自指挥", "hand.point.up.left"), ("舰队", "sailboat"), ("排行", "list.number"), ("统计", "chart.bar"), ("纪事", "book.pages"), ("国史", "book.pages"),
        ("军情", "binoculars"),
        // 国势 (the nation page's five rows: every row carries its icon, not 财政 alone).
        ("军略", "flag.2.crossed"), ("守御", "shield.lefthalf.filled"), ("财政", "banknote"), ("民生", "leaf"), ("安定", "house"),
        // 设置与菜单 (more specific words first: the first match wins).
        ("国界", "square.dashed"), ("行省边界", "square.grid.2x2"), ("省界", "square.grid.2x2"), ("航线", "ferry"), ("经纬线", "globe"),
        ("城市名称", "textformat"), ("城市图标", "building.2"), ("国名", "character.textbox"), ("全称", "character.textbox"),
        ("地貌", "mountain.2"), ("植被", "tree"), ("山脉", "mountain.2"), ("河流", "water.waves"), ("海洋", "water.waves"), ("暗边", "circle.lefthalf.filled"),
        ("颜色", "paintpalette"), ("国色", "paintpalette"), ("浓度", "drop.halffull"),
        ("音乐", "music.note"), ("音效", "speaker.wave.2"), ("声音", "speaker.wave.2"), ("震动", "iphone.radiowaves.left.and.right"), ("触感", "iphone.radiowaves.left.and.right"),
        ("帧率", "speedometer"), ("流畅", "speedometer"), ("画质", "photo"), ("分辨率", "photo"), ("降温", "thermometer.snowflake"), ("发热", "thermometer.sun"), ("耗时", "stopwatch"), ("调试", "ladybug"),
        ("自动存档", "clock.arrow.circlepath"), ("存档", "tray.and.arrow.down"), ("开场", "film"), ("镜头", "camera.viewfinder"), ("动画", "sparkles.rectangle.stack"),
        ("箭头", "arrow.up.right"), ("军旗", "flag"), ("军队图标", "shield"), ("显示军队", "eye"), ("兵力数字", "number"),
        ("战争期限", "hourglass"), ("间隔", "timer"), ("自主结盟", "person.2"), ("允许", "checkmark.seal"), ("附庸叛变", "crown"), ("自动", "gearshape.2"), ("外交", "scroll"), ("同盟", "person.2"), ("附庸", "crown"), ("停战", "hand.raised"), ("条约", "doc.text"), ("宣战", "flag.2.crossed"), ("战争", "flag.2.crossed"),
        ("叛乱", "flame"), ("内战", "flame"), ("家族", "person.3"), ("世家", "person.3"), ("继承", "person.badge.clock"), ("君主", "crown"), ("年龄", "calendar"), ("纪年", "calendar"),
        ("都城", "star"), ("性格", "theatermasks"), ("好战", "bolt"), ("生计", "leaf"), ("国家", "flag"), ("州", "map"), ("省", "map"), ("种子", "dice"),
        ("疆域", "map"), ("现存", "flag"), ("人口上限", "person.3.sequence"), ("人口", "person.3"), ("信徒", "person.3"),
        ("战役", "flag.2.crossed"), ("参战", "flag.2.crossed"), ("歼灭", "scope"), ("折损", "cross.case"),
        ("战争状态", "exclamationmark.shield"), ("交战", "exclamationmark.shield"), ("城市防御", "building.2"), ("城防", "building.2"),
        ("兵力", "shield.lefthalf.filled"), ("满编", "shield.lefthalf.filled"), ("军队", "shield.lefthalf.filled"), ("编制", "flag"),
        ("士气", "flame"), ("粮", "leaf"), ("补给", "leaf"),
        ("国库", "banknote"), ("月入", "banknote"), ("收入", "banknote"), ("金", "banknote"), ("财", "banknote"), ("增收", "chart.line.uptrend.xyaxis"),
        ("国运", "sparkles"), ("施政", "building.columns"), ("地方官", "person.text.rectangle"), ("国策", "scroll"),
        ("政体", "crown"), ("文化", "book.closed"), ("宗教", "book.closed"),
        ("州郡", "map"), ("行省", "map"), ("领土", "map"), ("区域", "square.grid.3x3"), ("特产", "shippingbox"),
        ("当前状态", "figure.walk"), ("征召", "house"), ("服役", "hourglass"), ("首都", "star"),
    ]
    static func of(_ label: String) -> String? { table.first { label.contains($0.0) }?.1 }
    /// A small line icon in the seal colour, the same at every row.
    static func icon(_ label: String, size: CGFloat = 14) -> some View {
        Group { if let g = of(label) { Image(systemName: g).font(.system(size: size, weight: .regular)).foregroundStyle(Theme.seal.opacity(0.8)).frame(width: size + 8) } }
    }
}

/// A label with its icon (if one fits), in the label's colour.
struct GlyphLabel: View {
    let text: String
    var body: some View {
        HStack(spacing: 5) {
            if let g = Glyph.of(text) { Image(systemName: g).font(.system(size: 12, weight: .medium)).foregroundStyle(Theme.seal.opacity(0.75)).frame(width: 16) }
            Text(text)
        }
    }
}

/// 宗教: holy book and practices (the original's for the faiths it has; the rest after the faith's own
/// tradition) and its followers across the world.
enum Faith {
    static let catalog: [String: (book: String, practices: [String])] = [
        "catholic": ("圣经", ["祈祷", "礼拜仪式", "圣礼（如洗礼、圣餐）"]),
        "orthodox": ("圣经", ["祈祷", "礼拜仪式", "圣礼（如洗礼、圣餐）"]),
        "protestant": ("圣经", ["祈祷", "礼拜仪式", "圣礼（如洗礼、圣餐）"]),
        "islam": ("古兰经", ["每日五次祈祷（礼拜）", "斋月期间斋戒（斋戒）", "朝觐麦加（朝觐）"]),
        "buddhism": ("三藏（巴利文经典）", ["冥想", "道德生活（五戒）", "学习佛教教义"]),
        "tengri": ("长生天之言", ["天神", "秘传", "与天共鸣"]),
        "norse": ("北地境巅", ["守护神", "不屈信仰", "追逐权力"]),
        "confucian": ("四书五经", ["祭孔释奠", "科举取士", "宗法礼制"]),
        "quanzhen": ("道藏", ["内丹清修", "三教合一", "丛林出家"]),
        "zhengyi": ("正一经", ["符箓斋醮", "天师传承", "驱邪祈福"]),
        "chan": ("六祖坛经", ["参禅打坐", "农禅并重", "顿悟见性"]),
        "pureLand": ("无量寿经", ["念佛往生", "结社修行", "放生积德"]),
        "tiantai": ("妙法莲华经", ["止观双修", "一念三千", "忏法"]),
        "tantric": ("甘珠尔", ["灌顶传法", "活佛转世", "转经朝圣"]),
        "whiteLotus": ("弥勒下生经", ["烧香结社", "弥勒下生", "白莲忏法"]),
        "manichean": ("二宗三际经", ["明暗二宗", "素食戒律", "崇拜光明"]),
        "nestorian": ("圣经（景教译本）", ["十字礼拜", "七日一荐", "医药济世"]),
        "chineseFolk": ("无定典（口传与方志）", ["祭祖", "社稷之祭", "岁时节令"]),
        "daoism": ("道德经", ["斋醮科仪", "内丹修炼", "清静无为"]),
        "shinto": ("古事记", ["参拜神社", "祓禊", "祭礼"]),
        "judaism": ("妥拉", ["守安息日", "饮食洁规", "逾越节"]),
        "hinduism": ("吠陀", ["祭祀", "达摩（法）", "朝圣恒河"]),
        "zoroastrian": ("阿维斯陀", ["圣火崇拜", "善思、善言、善行", "天葬"]),
        "grecoRoman": ("神谱", ["献祭", "神谕", "节庆竞技"]),
        "kemetic": ("亡灵书", ["神庙祭祀", "木乃伊葬仪", "尼罗节庆"]),
        "aztecFaith": ("神历手抄本", ["太阳献祭", "历法祭典", "羽蛇神崇拜"]),
        "incaFaith": ("口传圣歌", ["太阳祭", "祖灵崇拜", "山神供奉"]),
    ]
}

struct FaithCard: View {
    let religion: String
    let state: GameState?
    var map: WorldMap? = nil
    var effect: String? = nil
    var shares: [NationInfo.FaithShare]? = nil
    var body: some View {
        if let f = Faith.catalog[religion] {
            let followers = (state?.nations ?? []).filter { $0.alive && $0.religion == religion }
            VStack(alignment: .leading, spacing: 8) {
                HStack(alignment: .firstTextBaseline) {
                    Text(Names.religion[religion] ?? religion).font(Theme.kai(18)).foregroundStyle(Theme.ink)
                    Spacer()
                    Text("圣书《\(f.book)》").font(Theme.kai(14)).foregroundStyle(Theme.ink2)
                }
                HStack(spacing: 6) {
                    Text("教规").font(Theme.kai(13)).foregroundStyle(Theme.ink2)
                    ForEach(f.practices, id: \.self) { p in
                        Text(p).font(Theme.kai(13)).foregroundStyle(Theme.ink).lineLimit(1).minimumScaleFactor(0.7)
                            .padding(.horizontal, 7).padding(.vertical, 3).background(Theme.paper2, in: RoundedRectangle(cornerRadius: 5))
                            .overlay(RoundedRectangle(cornerRadius: 5).stroke(Theme.line))
                    }
                }
                Text("信徒约 \(Names.wan(followers.reduce(0) { $0 + $1.population })) · 奉行国家 \(followers.count) 个").font(Theme.kai(13)).foregroundStyle(Theme.ink2)
                if let effect, !effect.isEmpty { Text("国教之效：" + effect).font(Theme.kai(12)).foregroundStyle(Theme.seal.opacity(0.9)).fixedSize(horizontal: false, vertical: true) }
                // 信仰构成: the realm's provinces by faith, as one bar and its legend.
                if let shares, shares.count > 1 {
                    let total = max(1, shares.reduce(0) { $0 + $1.provinces })
                    GeometryReader { g in
                        HStack(spacing: 1.5) {
                            ForEach(Array(shares.enumerated()), id: \.offset) { i, s in
                                Rectangle().fill(s.heresy ? Color(red: 0.45, green: 0.08, blue: 0.08) : Theme.seal.opacity(max(0.25, 0.85 - Double(i) * 0.17))).frame(width: max(3, g.size.width * CGFloat(s.provinces) / CGFloat(total)))
                            }
                        }
                        .clipShape(Capsule())
                    }
                    .frame(height: 7)
                    WrapLayout(spacing: 6) {
                        ForEach(Array(shares.enumerated()), id: \.offset) { _, s in
                            Text("\(s.name) \(s.provinces)州").font(Theme.kai(11)).foregroundStyle(s.heresy ? Color(red: 0.45, green: 0.08, blue: 0.08) : Theme.ink2)
                        }
                    }
                }
                // 圣地: the faith's holy province and who holds it now.
                if let map, let h = state?.holy?.first(where: { $0.religion == religion }), map.meta.provinces.indices.contains(h.province) {
                    let owner = state?.owners.indices.contains(h.province) == true ? state!.owners[h.province] : -1
                    HStack(spacing: 6) {
                        Image(systemName: "sparkle").font(.system(size: 12)).foregroundStyle(Color(red: 0.72, green: 0.52, blue: 0.14))
                        Text("圣地 \(map.meta.provinces[h.province].name)").font(Theme.kai(14)).foregroundStyle(Theme.ink)
                        if owner >= 0, owner < map.meta.nations.count { Text("今属\(map.meta.nations[owner].name)").font(Theme.kai(13)).foregroundStyle(Theme.ink2) }
                    }
                }
            }
            .padding(.horizontal, 16).padding(.vertical, 11)
        }
    }
}
