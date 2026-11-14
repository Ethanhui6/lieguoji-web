import Foundation

/// 国名多样 (app-rule worlds, new worlds only): the opening states draw their historical names from a
/// wider pool than the opening catalogue (cultures.json keeps the web engine's order, so its golden
/// samples stay comparable), and each takes a form of government fitting its culture among those of
/// its polity (Regimes.styles: 苏丹国, 公国, 汗国, 沙皇国, 幕府, 城邦…). The polity itself, and with it
/// every rule, is the one the world was founded with; only the name, title and party system follow the
/// form. Every draw hashes the world seed and the state id, so a replay names the same states.
enum NameVariety {
    /// Real historical states added to each culture's catalogue for historical-names worlds.
    static let extraStates: [String: [String]] = [
        "chinese": ["商", "殷", "西周", "东周", "新", "后汉", "曹魏", "蜀汉", "东吴", "西晋", "东晋", "前秦", "后秦", "北魏", "东魏", "西魏", "北齐", "北周", "南齐", "南梁", "南陈", "武周", "后梁", "后唐", "后晋", "后周", "南唐", "吴越", "前蜀", "后蜀", "南汉", "北汉", "闽", "马楚", "西夏", "大理", "南诏", "北宋", "南宋", "大顺", "南明", "大西", "中山", "巴", "滇", "夜郎", "徐", "莒", "邾", "曹", "宋国", "虢", "随", "邓", "许", "息", "蔡国", "代", "西凉", "北凉", "南燕", "后燕", "成汉"],
        "japanese": ["尾张织田", "甲斐武田", "越后上杉", "相模北条", "骏河今川", "安艺毛利", "萨摩岛津", "土佐长宗我部", "出羽最上", "陆奥伊达", "近江浅井", "美浓斋藤", "备前宇喜多", "丰后大友", "肥前龙造寺", "伊予河野", "阿波三好", "加贺", "能登", "越前朝仓", "若狭", "丹波", "但马", "因幡", "伯耆", "石见", "周防大内", "筑前", "筑后", "日向", "大隅", "琉球", "虾夷", "常陆佐竹", "下野", "上野", "飞驒", "纪伊", "大和筒井", "奥州藤原"],
        "english": ["约克", "兰开斯特", "诺福克", "苏格兰", "威尔士", "格温内斯", "波伊斯", "德赫巴斯", "斯特拉思克莱德", "皮克特", "达尔里亚达", "林赛", "赫威赛", "德伊勒", "伯尼西亚", "爱尔兰", "康诺特", "阿尔斯特", "伦斯特", "芒斯特", "马恩"],
        "arab": ["法蒂玛", "阿尤布", "马穆鲁克", "阿格拉布", "伊德里斯", "图伦", "伊赫希德", "哈姆丹", "穆拉比特", "穆瓦希德", "哈夫斯", "马林", "宰亚尼", "拉苏勒", "齐亚德", "苏莱赫", "卡尔马特", "希拉", "巴林", "哈德拉毛"],
        "roman": ["西罗马", "东罗马", "苏瓦松", "帕尔米拉", "高卢帝国", "不列颠尼亚", "毛里塔尼亚", "努米底亚", "卡帕多细亚", "本都", "比提尼亚", "亚美尼亚", "加拉提亚", "色雷斯", "默西亚", "伊利里库姆", "诺里库姆", "雷蒂亚", "撒丁尼亚", "科西嘉"],
        "french": ["卡佩", "瓦卢瓦", "波旁", "奥尔良", "阿基坦公", "加斯科涅", "佛兰德", "皮卡第", "贝里", "奥弗涅", "多菲内", "萨伏依", "勃艮第伯", "里昂", "阿图瓦", "利穆赞", "普瓦图", "朗格多克", "鲁西永", "法兰克"],
        "german": ["霍亨斯陶芬", "霍亨索伦", "哈布斯堡", "维特尔斯巴赫", "韦尔夫", "梅克伦堡", "波美拉尼亚", "荷尔斯泰因", "石勒苏益格", "不伦瑞克", "卢森堡", "科隆", "美因茨", "特里尔", "巴登", "安哈尔特", "奥尔登堡", "条顿骑士团", "汉萨", "东法兰克", "西里西亚", "卡林西亚", "施蒂利亚", "蒂罗尔"],
        "greek": ["阿尔戈斯", "麦加拉", "叙拉古", "米利都", "以弗所", "萨摩斯", "开俄斯", "克里特", "塞浦路斯", "帕加马", "塞琉古", "托勒密", "安提柯", "本都", "博斯普鲁斯", "特拉布宗", "伊庇鲁斯专制", "尼西亚", "摩里亚", "阿卡迪亚", "福基斯", "皮洛斯"],
        "persian": ["萨法维", "阿夫沙尔", "赞德", "恰加尔", "伽色尼", "萨曼", "布韦希", "塔希尔", "萨法尔", "齐亚尔", "卡库伊", "穆扎法尔", "帖木儿", "黑羊", "白羊", "贵霜", "印度-帕提亚", "阿兰", "达伊拉姆", "马赞达兰"],
        "slavic": ["弗拉基米尔", "苏兹达尔", "梁赞", "特维尔", "普斯科夫", "加利奇", "沃伦", "切尔尼戈夫", "斯摩棱斯克", "波洛茨克", "大摩拉维亚", "斯洛文尼亚", "杜克利亚", "波斯尼亚", "拉什卡", "泽塔", "莫斯科大公", "白罗斯", "鲁塞尼亚", "喀尔巴阡"],
        "norse": ["卡尔马", "芬兰", "法罗", "设得兰", "马恩", "诺曼", "格陵兰", "赫布里底", "阿格德", "霍洛加兰", "乌普兰", "斯维阿", "约姆", "罗斯", "瓦良格", "西约特兰", "东约特兰", "斯莫兰"],
        "indian": ["孔雀", "笈多", "贵霜", "萨塔瓦哈纳", "遮娄其", "帕拉瓦", "拉什特拉库塔", "波罗", "普拉蒂哈拉", "毗奢耶那伽罗", "巴赫曼尼", "马拉塔", "拉其普特", "锡克", "莫卧儿", "德里", "孟加拉", "古吉拉特", "迈索尔", "海得拉巴", "旁遮普", "克什米尔", "阿萨姆", "奥里萨"],
        "korean": ["加耶", "金官伽倻", "大伽倻", "后高句丽", "泰封", "摩震", "卒本", "北扶余", "马韩", "辰韩", "弁韩", "乐浪", "带方", "于山", "真番", "临屯"],
        "mongol": ["大蒙古", "金帐", "蓝帐", "白帐", "窝阔台", "鞑靼部", "科尔沁", "察哈尔", "喀尔喀", "土默特", "鄂尔多斯", "和硕特", "杜尔伯特", "土尔扈特", "辉特", "汪古", "弘吉剌", "斡亦剌", "札剌亦儿", "泰赤乌"],
        "turkic": ["阿瓦尔", "可萨", "保加尔", "佩切涅格", "乌古斯", "葛逻禄", "黠戛斯", "沙陀", "高昌回鹘", "甘州回鹘", "加兹尼", "卡拉曼", "达尼什曼德", "杜尔卡迪尔", "黑羊", "喀山", "阿斯特拉罕", "克里米亚", "西伯利亚", "希瓦", "布哈拉", "浩罕"],
        "egyptian": ["第一王朝", "古王国", "中王国", "新王国", "希克索斯", "赛斯", "利比亚", "塔尼斯", "纳帕塔", "阿克苏姆", "布托", "涅亨", "希拉孔波利斯", "阿拜多斯", "象岛", "法尤姆"],
        "spanish": ["西哥特", "苏维汇", "巴伦西亚", "穆尔西亚", "巴达霍斯", "塞维利亚", "托莱多王国", "潘普洛纳", "乌赫尔", "巴塞罗那", "加利西亚", "安达卢斯", "阿尔梅里亚", "马拉加", "卡斯蒂利亚-莱昂", "比斯开"],
        "italian": ["费拉拉", "摩德纳", "帕尔马", "比萨", "锡耶纳", "卢卡", "乌尔比诺", "教皇国", "阿马尔菲", "加埃塔", "贝内文托", "斯波莱托", "弗留利", "阿奎莱亚", "蒙费拉", "萨卢佐", "伦巴第王国", "东哥特", "西西里王国", "那不勒斯王国"],
        "vietnamese": ["丁朝", "前黎", "李朝", "陈朝", "胡朝", "后黎", "莫朝", "西山", "阮朝", "南掌", "扶南", "真腊", "林邑", "交趾", "九真", "日南", "广南", "郑主"],
        "tibetan": ["雅隆", "古格王朝", "阿里", "贡塘", "仁蚌", "辛厦", "藏巴", "甘丹颇章", "德格", "囊谦", "江孜", "芒域", "工布", "达布", "羊同", "木雅"],
        "hungarian": ["阿尔帕德", "安茹匈牙利", "匈雅提", "东匈牙利", "西匈牙利", "克罗地亚-斯拉沃尼亚", "瓦拉几亚", "摩尔达维亚", "马扎尔", "潘诺尼亚", "外多瑙", "多瑙河间", "上蒂萨", "下蒂萨"],
        "polish": ["皮雅斯特", "雅盖隆", "波兰-立陶宛", "西里西亚公国", "克拉科夫", "桑多梅日", "文奇察", "西拉兹", "普沃茨克", "格涅兹诺", "海乌姆", "鲁塞尼亚", "普鲁士公国", "利沃尼亚"],
        "portuguese": ["勃艮第王朝", "阿维什", "布拉干萨", "加利西亚伯", "葡萄牙伯", "安哥拉", "莫桑比克", "果阿", "澳门", "佛得角", "圣多美", "帝汶", "马六甲", "霍尔木兹"],
        "dutch": ["荷兰伯", "海尔德", "林堡", "列日", "布拉邦公", "佛兰德伯", "埃诺", "那慕尔", "卢森堡公", "联省", "巴达维亚", "开普", "新尼德兰", "苏里南", "锡兰"],
        "aztec": ["奥尔梅克", "特奥蒂瓦坎", "托托纳克", "瓦斯特克", "塔拉斯坎", "奥托米", "乔卢拉", "韦霍钦科", "库尔瓦坎", "阿斯卡波察尔科", "霍奇米尔科", "查尔科", "玛雅潘", "奇琴伊察", "乌斯马尔", "蒂卡尔", "帕伦克", "科潘"],
        "inca": ["瓦里", "蒂瓦纳科", "莫切", "纳斯卡", "帕拉卡斯", "查文", "卢帕卡", "科利亚", "钱卡", "瓦尔帕", "卡尼亚里", "帕尔塔", "马普切", "艾马拉", "孔蒂苏尤", "维尔卡班巴"],
    ]

    /// The forms each polity may take in a culture, with their weights (the polity's usual form fills the rest).
    static func forms(polity: String, culture: String, religion: String) -> [(style: String, weight: Double)] {
        switch polity {
        case "Kingdom":
            switch culture {
            case "arab", "persian", "turkic": return [("sultanate", 0.6), ("absolute", 0.25), ("feudal", 0.15)]
            case "german", "polish", "hungarian": return [("principality", 0.3), ("elective", 0.2), ("feudal", 0.3), ("absolute", 0.2)]
            case "french", "italian", "slavic": return [("principality", 0.3), ("feudal", 0.35), ("absolute", 0.35)]
            case "english", "dutch", "norse", "spanish", "portuguese": return [("constitutional", 0.25), ("feudal", 0.35), ("absolute", 0.4)]
            default: return [("feudal", 0.4), ("absolute", 0.45), ("regency", 0.15)]
            }
        case "Empire":
            switch culture {
            case "slavic": return [("tsardom", 0.65), ("empire", 0.35)]
            case "japanese": return [("shogunate", 0.4), ("empire", 0.6)]
            case "chinese", "vietnamese", "korean": return [("dynasty", 0.35), ("empire", 0.5), ("despotism", 0.15)]
            case "mongol", "turkic": return [("empire", 0.7), ("despotism", 0.3)]
            default: return [("empire", 0.75), ("despotism", 0.25)]
            }
        case "Tribal":
            switch culture {
            case "mongol", "turkic": return [("khanate", 0.7), ("tribal", 0.3)]
            default: return [("chiefdom", 0.35), ("tribal", 0.65)]
            }
        case "Republic":
            switch culture {
            case "italian", "greek": return [("citystate", 0.4), ("merchant", 0.25), ("oligarchic", 0.2), ("democratic", 0.15)]
            case "dutch": return [("merchant", 0.5), ("parliamentary", 0.25), ("democratic", 0.25)]
            case "roman": return [("oligarchic", 0.5), ("citystate", 0.2), ("democratic", 0.3)]
            default: return [("democratic", 0.45), ("parliamentary", 0.2), ("presidential", 0.2), ("oligarchic", 0.15)]
            }
        case "Federation": return [("federal", 0.55), ("confederation", 0.3), ("union", 0.15)]
        case "Theocracy":
            switch religion {
            case "islam": return [("caliphate", 1)]
            case "catholic": return [("papacy", 0.7), ("order", 0.3)]
            case "buddhism": return [("lamaism", 0.6), ("theocracy", 0.4)]
            default: return [("theocracy", 0.8), ("holy", 0.2)]
            }
        default: return []
        }
    }

    /// 0…1 from the seed and a key (FNV-1a, as Opening.hash).
    static func draw(_ seed: String, _ key: String) -> Double { Double(Opening.hash("\(seed)/\(key)") % 100_000) / 100_000 }

    /// Once per new world (before its first day): wider historical names and culture forms of government.
    static func apply(_ r: JS) {
        guard !r.regimes.isNull, !r.regimes.namesVaried.isTruthy else { return }
        r.regimes.namesVaried = JS(true)
        // A world already under way keeps the names its player knows.
        guard r.clock.tick.asNumber == 0, !r.civilization.isNull else { return }
        let seed = r.world.custom.seed.asString, mode = r.civilization.mode.optionalString ?? ""
        let nations = r.world.nations.asArray
        var used = Set(nations.compactMap { r.civilization.nations[$0.id.asString].name.value.optionalString })
        for n in nations {
            let id = n.id.asString, c = r.civilization.nations[id]
            guard !c.isNull, c.origin.optionalString ?? "new-world" == "new-world", c.name.custom.isNull else { continue }
            let culture = c.cultureId.optionalString ?? "", polity = c.polity.optionalString ?? "Kingdom"
            // A wider pool: the catalogue's names and the added ones, from a seeded start.
            if mode == "historical-names", let profile = Founding.cultures.first(where: { $0.id == culture }) {
                let pool = profile.historicalStates + (extraStates[culture] ?? []).filter { !profile.historicalStates.contains($0) }
                if !pool.isEmpty {
                    let old = c.name.value.optionalString ?? ""
                    let start = Int(Opening.hash("\(seed)/variety/\(id)") % UInt32(pool.count))
                    if let pick = (0..<pool.count).lazy.map({ pool[(start + $0) % pool.count] }).first(where: { $0 == old || !used.contains($0) }) {
                        used.remove(old); used.insert(pick)
                        c.name.value = JS(pick)
                    }
                }
            }
            // A form of government fitting the culture.
            let options = forms(polity: polity, culture: culture, religion: c.religionId.optionalString ?? "")
            let total = options.reduce(0) { $0 + $1.weight }
            if total > 0 {
                var x = draw(seed, "form/\(id)") * total, chosen = options.last!.style
                for o in options { x -= o.weight; if x < 0 { chosen = o.style; break } }
                if let s = Regimes.styles.first(where: { $0.id == chosen && $0.base == polity }) {
                    let b = Regimes.book(r, id); b.style = JS(s.id); b.parties = .null
                }
            }
            n.name = JS(Regimes.title(r, id, base: c.name.value.optionalString ?? MapLayers.stateLabel(n.name.asString, full: false), style: Regimes.style(r, id)))
        }
    }
}
