import SwiftUI
import LieguojiCore

/// Each trait's effect description, from the original's Traits/CharacterTraits/localization.csv
/// (CharacterTraitDesc_*, Chinese column), keyed by the web's trait label. Only these 27 strings are
/// copied; see ios-native/Resources/SOURCE.md.
enum TraitText {
    static func caption(_ name: String) -> String { effect[name].map { "：" + $0 } ?? "" }
    static let effect: [String: String] = [
        "天才": "拥有超凡的智慧和卓越的头脑",
        "勇敢": "在战斗中无所畏惧，深受士兵敬仰",
        "魅力超凡": "天生的领导者，能激发他人的忠诚",
        "行政天才": "在管理国家事务方面表现卓越",
        "外交家": "擅长谈判和建立关系",
        "公正": "判断公平公正，深受人民爱戴",
        "战略家": "军事战术和战略大师",
        "仁慈": "对被征服者表现出仁慈，更倾向于宽恕和恢复被征服家族的领地",
        "耐心": "愿意等待合适的时机",
        "懦弱": "胆小怕事，为士兵所不齿",
        "残暴": "对被征服者毫不留情，更倾向于清洗和剥夺被征服家族的一切",
        "无能": "缺乏有效治理的能力",
        "贪婪": "痴迷于财富和个人利益",
        "偏执": "到处都看到敌人",
        "易怒": "容易发怒，惩罚严厉",
        "雄心勃勃": "有着远大的抱负，渴望权力",
        "长袖善舞": "擅长社交，作为族长或国家领导人时，其他势力对其好感度+20",
        "鹰派": "强硬派，紧急动员时可额外征召30%的军队",
        "鸽派": "温和派，无法进行紧急动员",
        "统一者": "立志整合同文化诸邦 倾向对同文化邻国发动统一战争",
        "越战越勇": "面对多线作战时愈发勇猛，每个敌对国家增加5%战斗力（最多50%）",
        "厌战": "厌倦战争，每个敌对国家减少5%战斗力（最多-50%）",
        "海军精通": "精通海战指挥 使所属国家海军战斗力提升30%",
        "船舶大师": "精通船舶建造 使军舰建造时间减少50%",
        "改革家": "天生的改革家，上台时会触发改革判定，基于内政能力调整国家腐败度",
        "天生领袖": "天生的领导者，作为家族首领时增加50点家族影响力",
        "难以服众": "缺乏威望和号召力，作为家族首领时减少50点家族影响力",
        "雄才大略": "胸怀经天纬地之志：进攻 +6%、岁入 +8%、安定 +6，四维皆显著提升",
        "铁腕集权": "铁腕弹压权贵：进攻 +5%、防守 +4%、腐败下降，但外邦好感 −10",
        "仁德宽厚": "宽政爱民，四海归心：人口增长 +8%、安定 +8、外交好感 +14",
        "精于理财": "洞悉账目与度支：国库岁入 +12%、腐败度下降，行政大增",
        "兵法大家": "用兵如神，深谙阵法：全军进攻 +10%、防守 +6%，军事大增",
        "纵横捭阖": "善合纵连横之术：诸邦好感 +18、岁入 +4%，外交大增",
        "崇文重教": "兴学重道，文教昌明：人口增长 +4%、安定 +6、外交好感 +8",
        "开疆雄主": "锐意拓土，威震边陲：全军进攻 +8%、好战进取，但邦交好感 −12",
        "明法审令": "法度严明，赏罚必信：岁入 +6%、防守 +4%、安定 +5、腐败下降",
        "勤政爱民": "夙夜忧勤，轻徭薄赋：岁入 +6%、人口增长 +6%、安定 +6",
        "海权远见": "经略沧海，重商通洋：商贸岁入 +10%、防守 +4%、外交好感 +6",
        "民望所归": "深得民心与士林拥戴：安定 +10、人口增长 +5%、好感 +10",
        "宿将老谋": "老成持重，稳扎稳打：全军防守 +10%、安定 +4",
        "奢靡无度": "挥霍国帑，耽于享乐：岁入 −10%、安定 −6、腐败加剧",
        "刚愎自用": "拒谏饰非，独断误国：防守 −4%、安定 −6、诸邦好感 −10",
        "苛政暴戾": "严刑峻法，民怨沸腾：进攻 +4%、但人口增长 −6%、安定 −12、好感 −16"
    ]
}

/// 自定义人物: the four base skills (0…100) and up to four traits (天赋).
struct PersonEditor: View {
    let person: NationInfo.Person
    /// Skills, traits, then given name, family name and age (nil: unchanged).
    let save: ([Double], [String], String?, String?, Int?) -> Void
    @State private var skills: [Double] = [50, 50, 50, 50]
    @State private var traits: [String] = []
    @State private var first = ""
    @State private var last = ""
    @State private var age = 30.0
    static let skillNames = ["魅力", "军事", "外交", "行政"]
    static let allTraits = [
        "天才", "勇敢", "魅力超凡", "行政天才", "外交家", "公正", "战略家", "仁慈", "耐心", "改革家",
        "雄才大略", "铁腕集权", "仁德宽厚", "精于理财", "兵法大家", "纵横捭阖", "崇文重教", "开疆雄主",
        "明法审令", "勤政爱民", "海权远见", "民望所归", "宿将老谋",
        "天生领袖", "统一者", "越战越勇", "海军精通", "船舶大师", "长袖善舞", "雄心勃勃", "鹰派", "鸽派",
        "懦弱", "残暴", "无能", "贪婪", "偏执", "易怒", "厌战", "难以服众", "奢靡无度", "刚愎自用", "苛政暴戾"
    ]
    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 14) {
                SheetHeader(title: person.name, subtitle: "\(person.role) · \(Int(person.age)) 岁", seal: "改")
                SectionLabel("姓名与年岁")
                Group2 {
                    VStack(spacing: 10) {
                        HStack(spacing: 10) {
                            Text("姓").font(Theme.body).foregroundStyle(Theme.ink2).frame(width: 22)
                            TextField("", text: $last, prompt: Text("不改").foregroundColor(Theme.ink2.opacity(0.6))).paperField()
                            Text("名").font(Theme.body).foregroundStyle(Theme.ink2).frame(width: 22)
                            TextField("", text: $first, prompt: Text("不改").foregroundColor(Theme.ink2.opacity(0.6))).paperField()
                        }
                        PaperSlider(title: "年岁", value: $age, range: 0...100, step: 1) { "\(Int($0)) 岁" }
                    }
                    .padding(14)
                }
                .padding(.horizontal, 16)
                SectionLabel("能力")
                Group2 {
                    ForEach(0..<4, id: \.self) { i in
                        PaperSlider(title: Self.skillNames[i], value: $skills[i], range: 0...100, step: 1) { "\(Int($0))" }
                            .padding(.horizontal, 16).padding(.vertical, 8)
                        if i < 3 { Divider2() }
                    }
                }
                .padding(.horizontal, 16)
                Text("天赋（最多四项，影响实际能力）").font(Theme.label).foregroundStyle(Theme.ink2).padding(.horizontal, 24)
                Group2 {
                    LazyVGrid(columns: [GridItem(.adaptive(minimum: 82), spacing: 8)], spacing: 8) {
                        ForEach(Self.allTraits, id: \.self) { t in
                            let on = traits.contains(t)
                            Button {
                                withAnimation(Motion.tap) {
                                    if on { traits.removeAll { $0 == t } } else if traits.count < 4 { traits.append(t) }
                                }
                            } label: {
                                Text(t).font(Theme.body).foregroundStyle(on ? Theme.paper2 : Theme.ink).lineLimit(1).minimumScaleFactor(0.7)
                                    .frame(maxWidth: .infinity).frame(height: 32)
                                    .background(on ? Theme.seal : Theme.paper2, in: RoundedRectangle(cornerRadius: 9, style: .continuous))
                                    .overlay(RoundedRectangle(cornerRadius: 9, style: .continuous).stroke(on ? Color.clear : Theme.line))
                            }
                            .buttonStyle(PressStyle())
                        }
                    }
                    .padding(12)
                    ForEach(traits, id: \.self) { t in
                        (Text(t).foregroundStyle(Theme.ink) + Text(TraitText.caption(t)).foregroundStyle(Theme.ink2)).font(Theme.label)
                            .frame(maxWidth: .infinity, alignment: .leading)
                    }
                    .padding(.horizontal, 12).padding(.bottom, traits.isEmpty ? 0 : 10)
                }
                .padding(.horizontal, 16)
                Button {
                    save(skills, traits, first.isEmpty ? nil : first, last.isEmpty ? nil : last, Int(age) == Int(person.age) ? nil : Int(age))
                } label: { PrimaryLabel(title: "颁旨", symbol: "checkmark.seal") }.buttonStyle(PressStyle()).padding(.horizontal, 16)
            }
            .padding(.bottom, 24)
        }
        .onAppear { if person.skills.count == 4 { skills = person.skills }; traits = person.traits; age = person.age }
    }
}

/// 任命官员: the people who may take an office, ablest first; a tap appoints.
struct AppointSheet: View {
    @ObservedObject var model: GameModel
    let nation: Int
    let office: String
    var post: GameModel.PostInfo? = nil
    var who: NationInfo? = nil
    let appoint: (Int, String) -> Void
    @State private var people: [NationInfo.Person] = []
    @State private var loaded = false
    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 14) {
                SheetHeader(title: "任命" + (post?.title ?? (office.hasPrefix("WarCommander") ? "征伐主将" : NationSheet.title(String(office.split(separator: ":").first ?? ""), who))), subtitle: post.map { ["按魅力", "按军事", "按外交", "按行政"][min(3, max(0, $0.skill))] + "择优" } ?? NationSheet.officeDuty[office], seal: "任")
                Group2 {
                    if loaded && people.isEmpty { Text("本国暂无合适人选").font(Theme.body).foregroundStyle(Theme.ink2).frame(maxWidth: .infinity).padding(.vertical, 16) }
                    if !loaded { InkBusy(text: "载入……").frame(maxWidth: 200).frame(maxWidth: .infinity).padding(20) }
                    ForEach(Array(people.enumerated()), id: \.offset) { i, p in
                        Button { if let id = p.id { appoint(id, p.name) } } label: {
                            HStack(spacing: 10) {
                                Text(ChineseNumeral.of(i + 1)).font(Theme.label).foregroundStyle(Theme.seal).frame(width: 22)
                                VStack(alignment: .leading, spacing: 3) {
                                    Text("\(p.name)（\(p.female ? "女" : "男")，\(Int(p.age)) 岁）").font(Theme.body).foregroundStyle(Theme.ink)
                                    if p.skills.count == 4 {
                                        Text("魅力 \(Int(p.skills[0])) · 军事 \(Int(p.skills[1])) · 外交 \(Int(p.skills[2])) · 行政 \(Int(p.skills[3]))").font(Theme.caption).foregroundStyle(Theme.ink2)
                                    }
                                    ForEach(p.traits, id: \.self) { t in
                                        (Text(t).foregroundStyle(Theme.ink) + Text(TraitText.caption(t)).foregroundStyle(Theme.ink2)).font(Theme.caption)
                                    }
                                }
                                Spacer()
                                InkIcon(glyph: .peace, size: 14, weight: 1.8).foregroundStyle(Theme.seal)
                            }
                            .padding(.horizontal, 16).padding(.vertical, 9).contentShape(Rectangle())
                        }
                        .buttonStyle(.plain)
                        if i < people.count - 1 { Divider2() }
                    }
                }
                .padding(.horizontal, 16)
            }
            .padding(.bottom, 24)
        }
        .task {
            if let post { people = await model.postCandidates(nation, post: post.id) } else { people = await model.officeCandidates(nation, office: office) }
            loaded = true
        }
    }
}

/// A row that opens an editor when tapped: right-side framed tactile badge makes clickability unmistakable.
struct EditRow: View {
    let label: String; let value: String; let action: () -> Void
    var body: some View {
        Button {
            GameFeel.shared.tap()
            action()
        } label: {
            HStack(alignment: .center, spacing: 10) {
                HStack(spacing: 8) {
                    Glyph.icon(label)
                    Text(label).font(Theme.sans(14)).foregroundStyle(Theme.ink2)
                }
                .fixedSize()
                Spacer(minLength: 8)
                HStack(spacing: 5) {
                    Text(value)
                        .font(Theme.sans(13.8, weight: .medium))
                        .foregroundStyle(Theme.ink)
                        .monospacedDigit()
                        .multilineTextAlignment(.trailing)
                        .lineLimit(2)
                    PhosphorIcon(glyph: .brush, size: 11.5, weight: .light)
                        .foregroundStyle(Theme.seal.opacity(0.85))
                }
                .padding(.horizontal, 9).padding(.vertical, 5)
                .background(Theme.paperLight, in: RoundedRectangle(cornerRadius: 6, style: .continuous))
                .overlay(RoundedRectangle(cornerRadius: 6, style: .continuous).stroke(Theme.line, lineWidth: 0.85))
                .shadow(color: Theme.ink.opacity(0.06), radius: 0, y: 1)
            }
            .padding(.horizontal, 4).padding(.vertical, 10).contentShape(Rectangle())
        }
        .buttonStyle(.plain)
    }
}

/// 改数: one number, typed or dragged on a slider, then 颁行.
struct NumberEditSheet: View {
    let title: String; let unit: String; let value: Double
    /// The slider's range; nil reads it from the title (「0–100」), or −50…200 for a percentage, or
    /// 0 up to three times the current value.
    var range: ClosedRange<Double>? = nil
    let save: (Double) -> Void
    @State private var text = ""
    @State private var slide = 0.0
    private var bounds: ClosedRange<Double> { range ?? Self.infer(title, unit, value) }
    static func infer(_ title: String, _ unit: String, _ v: Double) -> ClosedRange<Double> {
        if let r = title.range(of: "-?[0-9]+–-?[0-9]+", options: .regularExpression) {
            let parts = title[r].split(separator: "–").compactMap { Double($0) }
            if parts.count == 2, parts[0] < parts[1] { return parts[0]...parts[1] }
        }
        if unit == "%" { return -50...200 }
        return 0...max(100, (abs(v) * 3).rounded())
    }
    /// Whole numbers, or a round step of a two-hundredth of a wide range.
    private func snap(_ v: Double) -> Double {
        let span = bounds.upperBound - bounds.lowerBound
        let step = span > 2000 ? pow(10, (log10(span / 200)).rounded(.down)) : 1
        return (v / step).rounded() * step
    }
    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            SheetHeader(title: title, subtitle: "现为 \(Self.format(value))\(unit)", seal: "改")
            HStack(spacing: 10) {
                TextField("", text: $text, prompt: Text(Self.format(value)).foregroundColor(Theme.ink2.opacity(0.6)))
                    .keyboardType(.numbersAndPunctuation).multilineTextAlignment(.trailing).paperField()
                if !unit.isEmpty { Text(unit).font(Theme.section).foregroundStyle(Theme.ink2) }
            }
            .padding(.horizontal, 22)
            VStack(spacing: 4) {
                PaperTrack(value: $slide, range: bounds, step: nil, onEditingChanged: nil)
                HStack {
                    Text(Self.format(bounds.lowerBound) + unit).font(Theme.caption).foregroundStyle(Theme.ink2)
                    Spacer()
                    Text(Self.format(bounds.upperBound) + unit).font(Theme.caption).foregroundStyle(Theme.ink2)
                }
            }
            .padding(.horizontal, 22)
            .onChange(of: slide) { _, v in let s = Self.format(snap(v)); if s != text { text = s } }
            .onChange(of: text) { _, t in if let v = Double(t), bounds.contains(v), abs(v - slide) > 0.5 { slide = v } }
            if let why = Self.rejection(text, range) {
                Text(why).font(Theme.label).foregroundStyle(Theme.seal).padding(.horizontal, 22)
            }
            SealButton(title: "颁行", disabled: Self.accepted(text, range) == nil) { if let v = Self.accepted(text, range) { save(v) } }.padding(.horizontal, 22)
        }
        .padding(.bottom, 16)
        .onAppear { slide = min(bounds.upperBound, max(bounds.lowerBound, value.isFinite ? value : bounds.lowerBound)) }
    }
    /// 可颁行的数：有限、不超出显式范围、绝对值不超过一万亿（调用方会转成整数，`1e20`、`nan`、`inf` 曾使其闪退）。
    static let limit = 1e12
    static func accepted(_ text: String, _ range: ClosedRange<Double>?) -> Double? {
        guard let v = Double(text.trimmingCharacters(in: .whitespaces)), v.isFinite, abs(v) <= limit else { return nil }
        if let range, !range.contains(v) { return nil }
        return v
    }
    /// 输入无效时给出原因（空输入不提示）。
    static func rejection(_ text: String, _ range: ClosedRange<Double>?) -> String? {
        let t = text.trimmingCharacters(in: .whitespaces)
        guard !t.isEmpty, accepted(t, range) == nil else { return nil }
        guard let v = Double(t), v.isFinite else { return "请输入数字。" }
        if let range, !range.contains(v) { return "须在 \(format(range.lowerBound))–\(format(range.upperBound)) 之间。" }
        return "数值过大。"
    }
    static func format(_ v: Double) -> String {
        guard v.isFinite else { return "—" }
        return v.rounded() == v && abs(v) < 1e15 ? String(Int(v)) : abs(v) >= 1e15 ? String(format: "%.3g", v) : String(format: "%.1f", v)
    }
}

/// 改党派: a party's name and its seats.
struct PartyEditSheet: View {
    let name: String; let seats: Int
    let save: (String, Int) -> Void
    @State private var text = ""
    @State private var value = 0.0
    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            SheetHeader(title: name, subtitle: "议席 \(seats) / 100", seal: "党")
            TextField("", text: $text, prompt: Text(name).foregroundColor(Theme.ink2.opacity(0.6))).paperField().padding(.horizontal, 22)
            PaperSlider(title: "议席", value: $value, range: 0...100, step: 1) { "\(Int($0)) 席" }.padding(.horizontal, 22)
            SealButton(title: "颁行") { save(text.isEmpty ? name : text, Int(value)) }.padding(.horizontal, 22)
        }
        .padding(.bottom, 16)
        .onAppear { value = Double(seats) }
    }
}
