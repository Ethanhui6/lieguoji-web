import Foundation

/// 26 大文明文化学说与文化认同系统（本作 App 规则专用，不影响网页逐字节对照黄金测试）：
/// - 每一种文明均拥有鲜明独特的「文化学说」（12%–30% 级别真实战力、经济、人口、安定、科研或制海加成）；
/// - 异文化州郡未教化前产生真实税收折损（−18%）与地方动荡（+18 叛乱倾向），令「推行文教」与文化版图具备深度战略意义。
public enum CultureDoctrines {
    public struct Doctrine: Sendable {
        public let id: String
        public let title: String
        public let summary: String
        public let attack: Double
        public let defense: Double
        public let income: Double
        public let growth: Double
        public let stability: Double
        public let corruption: Double
        public let navalPower: Double
        public let siegeBonus: Double

        public var effectLine: String {
            var parts = [String]()
            if attack != 0 { parts.append("进攻\(attack > 0 ? "+" : "")\(Int(attack))%") }
            if defense != 0 { parts.append("守御\(defense > 0 ? "+" : "")\(Int(defense))%") }
            if income != 0 { parts.append("岁入\(income > 0 ? "+" : "")\(Int(income))%") }
            if growth != 0 { parts.append("人口年增\(growth > 0 ? "+" : "")\(String(format: "%.1f", growth))%") }
            if stability != 0 { parts.append("安定\(stability > 0 ? "+" : "")\(Int(stability))") }
            if corruption != 0 { parts.append("腐化\(corruption > 0 ? "+" : "")\(Int(corruption))") }
            if navalPower != 0 { parts.append("海战\(navalPower > 0 ? "+" : "")\(Int(navalPower))%") }
            if siegeBonus != 0 { parts.append("破城\(siegeBonus > 0 ? "+" : "")\(Int(siegeBonus))%") }
            return parts.joined(separator: " · ")
        }
    }

    public static let all: [String: Doctrine] = [
        "chinese": Doctrine(id: "chinese", title: "礼乐郡县农本", summary: "编户齐民、农桑兴盛、文官体系绵密，兼具丰沛财税与庞大人口底蕴。",
                            attack: 4, defense: 10, income: 16, growth: 2.2, stability: 10, corruption: -4, navalPower: 4, siegeBonus: 8),
        "japanese": Doctrine(id: "japanese", title: "武士道与岛防", summary: "尚武克己、精兵死战，山海险隘防御强悍且擅长近海突袭。",
                             attack: 16, defense: 14, income: 6, growth: 0.8, stability: 8, corruption: -6, navalPower: 14, siegeBonus: 6),
        "english": Doctrine(id: "english", title: "海洋霸权与商律", summary: "远洋舰队纵横四海，海贸关税盈溢，议会财税信用稳健。",
                            attack: 6, defense: 10, income: 18, growth: 1.0, stability: 8, corruption: -6, navalPower: 26, siegeBonus: 4),
        "arab": Doctrine(id: "arab", title: "商路驼铃与铁骑", summary: "控扼陆海商道、轻骑奔袭千里，跨洲商贸与迅捷征伐兼备。",
                         attack: 14, defense: 6, income: 16, growth: 1.0, stability: 4, corruption: -2, navalPower: 10, siegeBonus: 8),
        "roman": Doctrine(id: "roman", title: "军团法典与驰道", summary: "严整军团方阵与完备成文法，攻城略地与行省统筹所向披靡。",
                          attack: 16, defense: 12, income: 10, growth: 1.2, stability: 10, corruption: -8, navalPower: 8, siegeBonus: 16),
        "french": Doctrine(id: "french", title: "骑士荣光与陆权", summary: "重骑冲阵、炮兵精锐、宫廷典章璀璨，陆战野战锋芒冠绝欧陆。",
                           attack: 16, defense: 8, income: 12, growth: 1.4, stability: 4, corruption: -2, navalPower: 8, siegeBonus: 14),
        "german": Doctrine(id: "german", title: "铁血军纪与工坊", summary: "严谨步炮协同与精工冶炼，野战纪律如铁、廉洁高效。",
                           attack: 18, defense: 14, income: 10, growth: 0.8, stability: 6, corruption: -10, navalPower: 4, siegeBonus: 12),
        "greek": Doctrine(id: "greek", title: "哲辩城邦与三列桨", summary: "城邦自治、海商荟萃、学术昌明，海战与要塞坚守俱佳。",
                          attack: 6, defense: 14, income: 16, growth: 0.8, stability: 6, corruption: -4, navalPower: 20, siegeBonus: 6),
        "persian": Doctrine(id: "persian", title: "万王驿道与行省", summary: "御道贯通、商税充盈、弓骑与重装并举，广土众民治理有序。",
                            attack: 10, defense: 10, income: 18, growth: 1.4, stability: 8, corruption: -4, navalPower: 4, siegeBonus: 10),
        "slavic": Doctrine(id: "slavic", title: "寒冬坚城与纵深", summary: "耐寒坚忍、国土纵深辽阔，本土焦土守御令强敌寸步难行。",
                           attack: 8, defense: 20, income: 4, growth: 1.8, stability: 6, corruption: 2, navalPower: 2, siegeBonus: 8),
        "norse": Doctrine(id: "norse", title: "维京长船与狂战", summary: "乘长船破浪奇袭、短兵相接悍不畏死，掠海与登陆战力惊人。",
                          attack: 22, defense: 6, income: 6, growth: 0.4, stability: 2, corruption: -6, navalPower: 24, siegeBonus: 10),
        "indian": Doctrine(id: "indian", title: "季风沃土与象兵", summary: "恒河沃野人烟稠密、香料珠宝云集，人口与商贸财源浑厚。",
                           attack: 8, defense: 10, income: 16, growth: 2.8, stability: 6, corruption: 2, navalPower: 8, siegeBonus: 10),
        "korean": Doctrine(id: "korean", title: "山城义兵与龟船", summary: "凭山筑城、火器龟船护海，虽处强邻之侧亦能韧性固守。",
                           attack: 6, defense: 18, income: 8, growth: 1.2, stability: 10, corruption: -6, navalPower: 16, siegeBonus: 6),
        "mongol": Doctrine(id: "mongol", title: "长生天铁骑", summary: "控弦百万、迂回包抄、攻城百战，旷野野战与远征锋芒无匹。",
                           attack: 26, defense: 4, income: 4, growth: 0.4, stability: -2, corruption: -4, navalPower: -8, siegeBonus: 14),
        "turkic": Doctrine(id: "turkic", title: "星月重炮与弯刀", summary: "精锐近卫军团配巨炮轰城，陆战突击与坚城破防皆称劲旅。",
                           attack: 18, defense: 8, income: 10, growth: 1.0, stability: 4, corruption: 0, navalPower: 12, siegeBonus: 20),
        "egyptian": Doctrine(id: "egyptian", title: "尼罗沃壤与圣典", summary: "大河岁稔、粮仓满盈，古文明威望与神权正统令国基稳固。",
                             attack: 6, defense: 12, income: 16, growth: 2.4, stability: 12, corruption: -4, navalPower: 8, siegeBonus: 6),
        "spanish": Doctrine(id: "spanish", title: "大方阵与远洋舰队", summary: "长枪火枪方阵步步为营，远洋黄金航路与坚韧军纪相辅相成。",
                            attack: 14, defense: 12, income: 14, growth: 0.8, stability: 6, corruption: -2, navalPower: 18, siegeBonus: 10),
        "italian": Doctrine(id: "italian", title: "文艺商邦与银行", summary: "商会银行遍布诸国、名匠学者云集，岁入丰厚且城防精巧。",
                            attack: 4, defense: 10, income: 24, growth: 1.0, stability: 4, corruption: -2, navalPower: 16, siegeBonus: 6),
        "vietnamese": Doctrine(id: "vietnamese", title: "山泽韧守与水师", summary: "深谙山林水网地形，伏击消耗与本土抗敌韧性极强。",
                               attack: 10, defense: 20, income: 6, growth: 1.6, stability: 8, corruption: -4, navalPower: 10, siegeBonus: 4),
        "tibetan": Doctrine(id: "tibetan", title: "雪域高原金刚", summary: "高寒险阻、信仰凝心，高原守御固若金汤且极难内乱。",
                            attack: 8, defense: 22, income: 2, growth: 0.6, stability: 16, corruption: -8, navalPower: -10, siegeBonus: 4),
        "hungarian": Doctrine(id: "hungarian", title: "黑军骑兵与关隘", summary: "精锐轻重骑兵与多瑙边防并举，野战反击迅猛凌厉。",
                              attack: 16, defense: 12, income: 8, growth: 0.8, stability: 4, corruption: -4, navalPower: 0, siegeBonus: 8),
        "polish": Doctrine(id: "polish", title: "翼骑冲锋与联邦", summary: "传奇重装翼骑兵破阵如雷，宽容宪政令多族疆土安定。",
                           attack: 20, defense: 10, income: 8, growth: 1.0, stability: 6, corruption: -2, navalPower: 2, siegeBonus: 8),
        "portuguese": Doctrine(id: "portuguese", title: "大航海商港网", summary: "远航探险、据点商港星罗棋布，海贸收益与远洋战舰首屈一指。",
                               attack: 6, defense: 8, income: 20, growth: 0.6, stability: 6, corruption: -4, navalPower: 26, siegeBonus: 4),
        "dutch": Doctrine(id: "dutch", title: "海上马车夫", summary: "金融商运冠绝天下，围海造田精耕细作，国库滚雪球般壮大。",
                          attack: 4, defense: 12, income: 26, growth: 1.2, stability: 8, corruption: -10, navalPower: 22, siegeBonus: 4),
        "aztec": Doctrine(id: "aztec", title: "太阳鹰豹勇士", summary: "尚武祀日、精锐豹鹰武士搏战凶悍，人口繁盛而征伐不休。",
                          attack: 22, defense: 8, income: 6, growth: 2.0, stability: 2, corruption: -2, navalPower: 0, siegeBonus: 10),
        "inca": Doctrine(id: "inca", title: "安第斯梯田驿道", summary: "高山梯田丰产、石砌驿道纵横，统筹动员与高原守御兼备。",
                         attack: 10, defense: 18, income: 12, growth: 2.0, stability: 12, corruption: -8, navalPower: 0, siegeBonus: 8),
    ]

    public static func of(_ cultureId: String?) -> Doctrine {
        let key = (cultureId ?? "").trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        if let d = all[key] { return d }
        return Doctrine(id: key.isEmpty ? "default" : key, title: "邦国古风", summary: "兼容并蓄的地方文化传统。",
                        attack: 4, defense: 4, income: 6, growth: 0.8, stability: 4, corruption: -2, navalPower: 4, siegeBonus: 4)
    }

    /// 某国当前主体文化的文化学说（网页逐字节黄金测试中不生效）。
    public static func forNation(_ r: JS, _ nationId: String) -> Doctrine? {
        guard UnitKinds.enabled, !r.regimes.isNull, r.regimes.enabled.isTruthy else { return nil }
        return of(r.civilization.nations[nationId].cultureId.optionalString)
    }

    /// 异文化州郡税收折损：本国文化 1.00×，未教化的异文化州郡降至 0.82×（突出「推行文教」价值）。
    public static func provinceTaxFactor(_ r: JS, nationId: String, provinceId: String) -> Double {
        guard UnitKinds.enabled, !r.regimes.isNull, r.regimes.enabled.isTruthy else { return 1.0 }
        let stateCulture = r.civilization.nations[nationId].cultureId.optionalString ?? ""
        guard !stateCulture.isEmpty else { return 1.0 }
        // 读取该州主城文化
        for c in r.world.cities.asArray where c.provinceId.optionalString == provinceId {
            let cid = c.id.asString
            let local = r.civilization.cities[cid].cultureId.optionalString ?? stateCulture
            if !local.isEmpty && local != stateCulture { return 0.82 }
            return 1.0
        }
        return 1.0
    }

    /// 异文化州郡叛乱倾向加成（未教化异文化州郡 +18 动荡）。
    public static func provinceUnrest(_ r: JS, _ province: JS) -> Int {
        guard UnitKinds.enabled, !r.regimes.isNull, r.regimes.enabled.isTruthy else { return 0 }
        let owner = province.controller.optionalString ?? ""
        guard !owner.isEmpty else { return 0 }
        return provinceTaxFactor(r, nationId: owner, provinceId: province.id.asString) < 0.99 ? 18 : 0
    }
}
