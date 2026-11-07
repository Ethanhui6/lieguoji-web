import SwiftUI
import LieguojiCore

/// 军团信息 (engine armyRecord): where an army was raised, its service, battles and the enemies it struck down.
struct ArmyService: Decodable {
    let home: Int; let days: Double; let full: Double; let levy: Bool
    let kills: Double; let losses: Double; let battles: Double; let reason: String
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
            }
            .padding(.horizontal, 16).padding(.vertical, 11)
        }
    }
}
