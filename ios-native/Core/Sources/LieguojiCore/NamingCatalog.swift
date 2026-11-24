import Foundation

/// 命名体系与文化名称库（本作 App 规则专用，不影响网页逐字节对照黄金测试）：
/// 统一治理国名清洗与拼合、架空国名生成、26 种文化的纯净人名与家族姓氏库、以及跨面板统一的人物姓名格式。
public enum NamingCatalog {
    // MARK: - 人物姓名格式规则

    /// 各文化人物姓名排布方式。
    public enum PersonNameOrder: Sendable {
        /// 姓前名后，无间隔符（中华、日本、朝鲜、越南：李文昭、织田信长、金成桂、陈兴道）。
        case familyFirstTight
        /// 姓/氏族前、名后，中点隔开（匈牙利、蒙古、突厥、吐蕃：匈雅提·马加什、孛儿只斤·铁木真、阿史那·土门、噶尔·禄东赞）。
        case familyFirstDot
        /// 罗马传统：男性 名·氏族，女性 阴性氏族·名。
        case roman
        /// 名前姓后，中点隔开（欧美、中东、南亚、美洲等：爱德华·金雀花、萨拉丁·阿尤布）。
        case givenFirstDot
    }

    public static func nameOrder(for culture: String) -> PersonNameOrder {
        switch culture {
        case "chinese", "japanese", "korean", "vietnamese": return .familyFirstTight
        case "hungarian", "mongol", "turkic", "tibetan": return .familyFirstDot
        case "roman": return .roman
        default: return .givenFirstDot
        }
    }

    /// 统一的人物姓名格式化（供朝堂、君主、人物表、族谱、史册共用）。
    public static func formatPerson(culture: String, given: String, house: String, gender: Int) -> String {
        let g = given.trimmingCharacters(in: .whitespacesAndNewlines)
        let h = cleanSurname(house)
        if h.isEmpty { return g.isEmpty ? "无名" : g }
        if g.isEmpty { return h }
        switch nameOrder(for: culture) {
        case .familyFirstTight:
            return g.hasPrefix(h) ? g : h + g
        case .familyFirstDot:
            return g.hasPrefix(h + "·") ? g : h + "·" + g
        case .roman:
            if gender == 1 {
                let fem = romanFemaleHouse(h)
                return g.hasPrefix(fem + "·") ? g : fem + "·" + g
            }
            return g.hasSuffix("·" + h) ? g : g + "·" + h
        case .givenFirstDot:
            return g.hasSuffix("·" + h) ? g : g + "·" + h
        }
    }

    /// 罗马氏族的女性阴性形式（若不在表内，尝试把“乌斯”转为“娅”）。
    static func romanFemaleHouse(_ house: String) -> String {
        let map: [String: String] = [
            "尤利乌斯": "尤利娅", "克劳狄乌斯": "克劳迪娅", "科尔内利乌斯": "科尔内莉娅", "艾米利乌斯": "艾米莉娅",
            "瓦莱里乌斯": "瓦莱里娅", "法比乌斯": "法比娅", "弗拉维乌斯": "弗拉维娅", "奥勒利乌斯": "奥蕾莉娅",
            "卡西乌斯": "卡西娅", "图利乌斯": "图利娅", "安东尼乌斯": "安东尼娅", "卡尔普尔尼乌斯": "卡尔普尔尼娅",
            "埃利乌斯": "埃莉娅", "乌尔皮乌斯": "乌尔皮娅", "塞普提米乌斯": "塞普提米娅", "利基尼乌斯": "利基尼娅",
            "苏尔皮基乌斯": "苏尔皮基娅", "塞姆普罗尼乌斯": "塞姆普罗尼娅", "多米提乌斯": "多米提娅", "马尔基乌斯": "马尔基娅",
            "尤尼乌斯": "尤尼娅", "昆克提乌斯": "昆克提娅", "庞培乌斯": "庞培娅", "李维乌斯": "李维娅",
            "波尔基乌斯": "波尔基娅", "霍滕西乌斯": "霍滕西娅", "卢塔提乌斯": "卢塔提娅", "帕皮里乌斯": "帕皮里娅",
            "曼利乌斯": "曼利娅", "波斯图米乌斯": "波斯图米娅",
        ]
        if let f = map[house] { return f }
        if house.hasSuffix("乌斯") && house.count > 2 { return String(house.dropLast(2)) + "娅" }
        return house
    }

    /// 清洗家族姓氏：去掉误带的“家族 / 家 / 氏 / 人”尾字，避免出现“特龙普家氏”“奇穆人家族”。
    public static func cleanSurname(_ raw: String) -> String {
        var s = raw.trimmingCharacters(in: .whitespacesAndNewlines)
        for bad in ["家族", "家", "人", "氏"] where s.hasSuffix(bad) && s.count > bad.count + 1 {
            s = String(s.dropLast(bad.count))
        }
        return s
    }

    /// 家族对外称谓：单双字东亚姓称「李氏」「司马氏」「藤原氏」，长音译姓称「哈布斯堡家族」或简洁「哈布斯堡氏」。
    public static func houseLabel(_ surname: String, long: Bool = false) -> String {
        let s = cleanSurname(surname)
        if s.isEmpty { return "无名氏" }
        return long ? s + "家族" : s + "氏"
    }

    // MARK: - 国名清洗、拼合与简写规则

    /// 全部已知政体后缀（按长度降序排列，避免「社会主义共和国」只剥掉「共和国」留下「社会主义」）。
    public static let politySuffixes: [String] = [
        "社会主义共和国", "最尊贵共和国", "社会共和国", "人民共和国", "商盟自由邦", "立宪王国", "联合王国", "骑士团国", "哈里发国", "伊玛目国",
        "法老王朝", "边区侯国", "埃米尔国", "护国公领",
        "苏丹国", "沙皇国", "教宗国", "神权国", "共和国", "军政府", "执政府", "督政府", "法王国", "法王领", "牧首领", "圣座领", "神宫领", "立宪国", "独裁国", "民族国",
        "自由市", "大公国", "节度镇", "都护府", "宣慰司",
        "王国", "帝国", "公国", "汗国", "联邦", "邦联", "城邦", "幕府", "公社", "酋邦", "义军", "部族", "部落", "王朝",
    ]

    /// 已知带前缀「大」的真实双字国号/地名（简写时不可误剥「大」字）。
    private static let keepLeadingDa: Set<String> = [
        "大理", "大宛", "大和", "大越", "大南", "大顺", "大西", "大名", "大同", "大阪", "大邱", "大都", "大隅", "大友", "大内", "大秦", "大夏", "大中", "大定", "大梁", "大金",
    ]

    /// 不可把冠字「大」剥离为单字核的真实地名/非中原朝代（如 大理≠理、大和≠和、大宛≠宛）。
    private static let preserveDaCore: Set<String> = [
        "大理", "大宛", "大和", "大越", "大南", "大名", "大同", "大阪", "大邱", "大都", "大隅", "大友", "大内", "大安", "大宁", "大兴", "大通",
    ]

    /// 中华双字断代/定向朝代与独立古国名：在帝制、王朝、王制下本身即为完整典雅国号，不叠拼「王国/帝国」。
    public static let chineseCompleteMonarchyTitles: Set<String> = [
        "西周", "东周", "西汉", "东汉", "后汉", "曹魏", "蜀汉", "东吴", "西晋", "东晋",
        "前秦", "后秦", "西秦", "北魏", "东魏", "西魏", "北齐", "北周", "南齐", "南梁", "南陈", "武周",
        "后梁", "后唐", "后晋", "后周", "南唐", "吴越", "前蜀", "后蜀", "南汉", "北汉", "马楚",
        "西夏", "大理", "南诏", "北宋", "南宋", "大顺", "南明", "大西", "天完", "新朝", "大中", "大定",
        "西凉", "北凉", "前凉", "南凉", "前燕", "后燕", "南燕", "北燕", "成汉", "胡夏", "高昌", "吐谷浑",
        "中山", "夜郎", "且兰", "句町", "南越", "闽越", "东瓯", "西楚", "北元", "后金", "前赵", "后赵",
        "代北", "河西", "陇右", "西蜀", "东夏", "西辽", "北辽", "南汉", "南平", "荆南", "清源", "定难",
        "归义", "大齐", "大燕", "大楚", "大汉", "大唐", "大宋", "大明", "大元", "大清", "大秦", "大周", "大晋", "大隋", "大金", "大辽", "大梁", "大赵", "大魏", "大蜀", "大吴", "大越", "大夏",
    ]

    /// 现代/共和/联邦/军政等非君主制细分政体 ID：这类政体不应沿用「大金」「北宋」「波旁」「阿拔斯」等王朝/皇室国号。
    public static let modernPolityStyles: Set<String> = [
        "democratic", "communist", "socialist", "oligarchic", "parliamentary", "presidential",
        "council", "federal", "confederation", "junta", "warlord", "dictatorship", "fascist", "nazi",
        "citystate", "merchant", "semiPresidential", "technocracy", "directorate",
        "senatorial", "consular", "dogate", "hanseatic", "freeCity", "protectorate",
    ]

    /// 各文化中属于“纯皇室/王朝”而非地理区域的名字（切换为共和国/联邦/军政府时应换为地理/民族基名）。
    private static let dynasticOnlyBases: [String: Set<String>] = [
        "japanese": ["德川", "足利", "织田", "丰臣", "北条", "藤原", "源", "平", "武田", "上杉", "毛利", "岛津", "伊达", "今川"],
        "french": ["卡佩", "瓦卢瓦", "波旁", "奥尔良", "墨洛温", "加洛林", "波拿巴"],
        "german": ["霍亨斯陶芬", "霍亨索伦", "哈布斯堡", "维特尔斯巴赫", "韦尔夫", "奥托", "萨利安", "卢森堡"],
        "english": ["金雀花", "都铎", "斯图亚特", "兰开斯特", "约克", "金雀", "汉诺威", "温莎"],
        "arab": ["倭马亚", "阿拔斯", "法蒂玛", "阿尤布", "马穆鲁克", "阿格拉布", "伊德里斯", "图伦", "伊赫希德", "哈姆丹", "穆拉比特", "穆瓦希德", "哈夫斯", "马林", "宰亚尼", "拉苏勒"],
        "persian": ["阿契美尼德", "萨珊", "萨法维", "阿夫沙尔", "赞德", "卡扎尔", "伽色尼", "萨曼", "布韦希", "塔希尔", "萨法尔", "齐亚尔", "穆扎法尔", "帖木儿", "黑羊", "白羊"],
        "turkic": ["奥斯曼", "塞尔柱", "喀喇汗", "帖木儿", "白羊", "黑羊", "阿史那", "加兹尼", "达尼什曼德", "杜尔卡迪尔"],
        "indian": ["孔雀", "笈多", "莫卧儿", "贵霜", "朱罗", "潘地亚", "帕拉瓦", "波罗", "遮娄其", "拉什特拉库塔", "巴赫曼尼"],
        "polish": ["皮雅斯特", "雅盖隆", "瓦萨"],
        "hungarian": ["阿尔帕德", "匈雅提", "安茹", "巴托里"],
        "portuguese": ["阿维什", "阿维斯", "布拉干萨"],
        "spanish": ["特拉斯塔马拉", "哈布斯堡", "波旁"],
        "greek": ["塞琉古", "托勒密", "安提柯"],
        "mongol": ["窝阔台", "察合台", "伊儿", "伊利", "金帐", "蓝帐", "白帐", "北元"],
    ]

    /// 26 种文化的地理/民族现代共和基名池：当政体变为共和国、人民共和国、联邦、军政府时优先选用，确保政体与国名符合现实。
    public static let modernRegionStates: [String: [String]] = [
        "chinese": [
            "中华", "华夏", "中原", "江南", "江淮", "巴蜀", "关中", "关陇", "燕云", "齐鲁",
            "岭南", "河洛", "荆楚", "吴越", "三晋", "陇右", "河西", "湖湘", "闽越", "滇黔",
            "辽东", "幽燕", "淮海", "江东", "江汉", "剑南", "山南", "朔方", "胶东",
            "黔中", "云贵", "河朔", "淮南", "浙东", "川蜀", "秦陇", "晋冀",
            "冀鲁", "湘楚", "陕甘", "西域", "燕赵", "两广", "两湖", "两浙",
            "河东", "河北", "河南", "关东", "辽西", "南粤", "八闽", "三秦", "三楚", "天府",
            "中州", "东吴", "西蜀", "南楚", "北燕", "幽州", "青州", "徐州", "扬州", "益州", "凉州", "并州",
        ],
        "japanese": [
            "日本", "扶桑", "关东", "关西", "九州", "四国", "东北", "北陆", "东海", "近畿",
            "山阳", "山阴", "北海道", "琉球", "大和", "信越", "奥羽", "筑紫", "日向",
            "甲信", "骏远", "尾张", "萨摩", "长州", "土佐", "肥前", "越后", "加贺", "备前", "纪伊",
            "安艺", "出云", "伊势", "近江", "摄津", "播磨", "筑前", "陆奥", "虾夷",
        ],
        "english": [
            "英格兰", "不列颠", "阿尔比恩", "苏格兰", "威尔士", "爱尔兰", "威塞克斯", "麦西亚",
            "诺森布里亚", "东盎格利亚", "康沃尔", "肯特", "萨塞克斯", "坎布里亚", "约克郡", "兰开夏",
            "海峡群岛", "高地", "低地", "阿尔斯特", "伦斯特", "芒斯特", "康诺特",
            "格洛斯特", "诺福克", "林肯", "德文", "达勒姆", "洛锡安", "曼岛",
        ],
        "french": [
            "法兰西", "高卢", "阿基坦", "勃艮第", "诺曼底", "布列塔尼", "普罗旺斯", "洛林",
            "香槟", "加斯科涅", "朗格多克", "奥弗涅", "皮卡第", "阿尔萨斯", "安茹", "萨伏依",
            "弗朗什孔泰", "卢瓦尔", "罗讷", "莱茵兰", "法兰德斯", "科西嘉",
            "图卢兹", "奥尔良", "普瓦图", "多菲内", "阿图瓦", "贝里", "利穆赞",
        ],
        "german": [
            "德意志", "普鲁士", "巴伐利亚", "萨克森", "奥地利", "莱茵兰", "威斯特伐利亚", "汉诺威",
            "符腾堡", "巴登", "黑森", "勃兰登堡", "石勒苏益格", "荷尔斯泰因", "波美拉尼亚", "西里西亚",
            "图林根", "法兰克尼亚", "士瓦本", "蒂罗尔", "施蒂利亚", "卡林西亚", "梅克伦堡", "波西米亚",
            "吕贝克", "汉堡", "不来梅", "纽伦堡", "科隆", "美因茨", "特里尔", "普法尔茨", "拿骚",
        ],
        "roman": [
            "罗马", "意大利", "拉丁", "高卢", "伊比利亚", "伊利里亚", "色雷斯", "达契亚",
            "叙利亚", "阿非利加", "潘诺尼亚", "不列颠尼亚", "西西里", "撒丁尼亚", "坎帕尼亚", "伊特鲁里亚",
            "山南高卢", "拉韦纳", "努米底亚", "毛里塔尼亚", "加拉太", "卡帕多西亚", "比提尼亚", "昔兰尼加",
        ],
        "greek": [
            "希腊", "海拉斯", "雅典", "斯巴达", "马其顿", "伊庇鲁斯", "色萨利", "伯罗奔尼撒",
            "爱琴", "克里特", "塞浦路斯", "伊奥尼亚", "色雷斯", "阿提卡", "罗得", "特拉布宗",
            "底比斯", "科林斯", "阿尔戈斯", "拜占庭", "尼西亚", "摩里亚", "蓬托斯", "叙拉古",
        ],
        "arab": [
            "阿拉伯", "叙利亚", "伊拉克", "埃及", "希贾兹", "内志", "也门", "阿曼",
            "沙姆", "美索不达米亚", "马格里布", "黎凡特", "突尼斯", "巴林", "阿西尔", "哈德拉毛",
            "努比亚", "的黎波里", "巴勒斯坦", "约旦", "黎巴嫩", "科威特",
            "麦加", "麦地那", "大马士革", "巴格达", "巴士拉", "摩苏尔", "阿勒颇", "凯鲁万", "菲斯", "科尔多瓦",
        ],
        "persian": [
            "伊朗", "波斯", "呼罗珊", "法尔斯", "米底", "埃兰", "锡斯坦", "吉兰",
            "马赞达兰", "阿塞拜疆", "克尔曼", "花剌子模", "河中", "粟特", "巴克特里亚", "胡齐斯坦",
            "伊斯法罕", "设拉子", "大不里士", "内沙布尔", "赫拉特", "巴尔赫", "梅尔夫", "帕提亚",
        ],
        "slavic": [
            "俄罗斯", "罗斯", "乌克兰", "白罗斯", "诺夫哥罗德", "莫斯科", "西伯利亚", "乌拉尔",
            "伏尔加", "塞尔维亚", "保加利亚", "克罗地亚", "斯洛文尼亚", "波斯尼亚", "捷克", "斯洛伐克",
            "摩拉维亚", "鲁塞尼亚", "黑山", "加利西亚",
            "基辅", "弗拉基米尔", "特维尔", "梁赞", "普斯科夫", "斯摩棱斯克", "顿河", "扎波罗热",
        ],
        "norse": [
            "斯堪的纳维亚", "北欧", "丹麦", "挪威", "瑞典", "冰岛", "芬兰", "日德兰",
            "斯堪尼亚", "哥得兰", "特伦德拉格", "西约特兰", "东约特兰", "拉普兰", "法罗",
            "乌普兰", "西兰", "芬兰湾", "奥克尼", "设得兰", "文兰", "格陵兰",
        ],
        "indian": [
            "印度", "婆罗多", "印度斯坦", "孟加拉", "旁遮普", "古吉拉特", "德干", "马哈拉施特拉",
            "泰米尔", "喀拉拉", "卡纳塔克", "安得拉", "奥里萨", "阿萨姆", "拉贾斯坦", "克什米尔",
            "迈索尔", "海得拉巴", "德里", "信德", "比哈尔",
            "摩揭陀", "羯陵伽", "毗奢耶那伽罗", "马尔瓦", "梅瓦尔", "马拉塔", "锡克", "阿瓦德",
        ],
        "korean": [
            "朝鲜", "韩国", "三韩", "高丽", "半岛", "京畿", "庆尚", "全罗",
            "忠清", "江原", "黄海", "平安", "咸镜", "济州", "渤海", "岭南", "湖南",
        ],
        "mongol": [
            "蒙古", "喀尔喀", "漠北", "漠南", "卫拉特", "准噶尔", "察哈尔", "鄂尔多斯",
            "呼伦贝尔", "阿尔泰", "布里亚特", "卡尔梅克", "图瓦", "科尔沁", "阿拉善",
        ],
        "turkic": [
            "突厥", "安纳托利亚", "土耳其", "图兰", "西域", "河中", "哈萨克", "乌兹别克",
            "吉尔吉斯", "土库曼", "阿塞拜疆", "克里米亚", "鞑靼斯坦", "巴什基尔", "伏尔加", "西伯利亚",
        ],
        "egyptian": [
            "埃及", "尼罗", "上埃及", "下埃及", "三角洲", "努比亚", "苏丹", "法尤姆",
            "底比斯", "孟斐斯", "亚历山大", "西奈", "红海", "利比亚",
        ],
        "spanish": [
            "西班牙", "伊比利亚", "卡斯蒂利亚", "阿拉贡", "加泰罗尼亚", "安达卢西亚", "莱昂", "加利西亚",
            "巴斯克", "纳瓦拉", "瓦伦西亚", "穆尔西亚", "阿斯图里亚斯", "巴利阿里", "埃斯特雷马杜拉",
        ],
        "italian": [
            "意大利", "伦巴第", "威尼托", "托斯卡纳", "皮埃蒙特", "利古里亚", "艾米利亚", "罗马涅",
            "坎帕尼亚", "西西里", "撒丁", "普利亚", "卡拉布里亚", "拉齐奥", "翁布里亚", "那不勒斯",
        ],
        "vietnamese": [
            "越南", "交趾", "升龙", "安南", "顺化", "广南", "清化", "义安",
            "南圻", "北圻", "中圻", "西原", "占婆", "红河", "湄公",
        ],
        "tibetan": [
            "雪域", "卫藏", "康巴", "安多", "阿里", "羌塘", "雅砻", "吐蕃",
            "拉萨", "日喀则", "昌都", "林芝", "山南", "多康",
        ],
        "hungarian": [
            "匈牙利", "马扎尔", "潘诺尼亚", "多瑙", "蒂萨", "特兰西瓦尼亚", "外多瑙", "大平原", "巴纳特",
        ],
        "polish": [
            "波兰", "维斯瓦", "大波兰", "小波兰", "马佐维亚", "西里西亚", "波美拉尼亚", "立陶宛", "库亚维亚", "喀尔巴阡",
        ],
        "portuguese": [
            "葡萄牙", "卢西塔尼亚", "里斯本", "波尔图", "米尼奥", "阿连特茹", "阿尔加维", "贝拉", "马德拉", "亚速尔",
        ],
        "dutch": [
            "尼德兰", "荷兰", "低地", "巴达维亚", "弗里斯兰", "泽兰", "布拉班特", "乌得勒支", "海尔德兰", "佛兰德",
        ],
        "aztec": [
            "墨西哥", "阿纳瓦克", "阿兹特兰", "特斯科科", "特拉斯卡拉", "瓦哈卡", "尤卡坦", "玛雅", "米却肯",
        ],
        "inca": [
            "安第斯", "秘鲁", "塔万廷苏尤", "库斯科", "基多", "玻利维亚", "智利", "阿雷基帕", "的的喀喀",
        ],
    ]

    /// 供去重使用的规范核心键：把「大金」「金」「金帝国」「大金王朝」规约为同一核心「金」，
    /// 避免 `Founding` 与 `Uprisings` 因带不带「大」或后缀而反复选中同一个朝代名（彻底修复中华后期无限大金）。
    public static func canonicalStateKey(_ raw: String) -> String {
        var s = cleanStateBase(raw)
        if s.isEmpty { return s }
        // 去掉开头的序数词（如 第二/第三/后/续）
        for ord in ["第二", "第三", "第四", "第五", "第六", "第七", "第八"] where s.hasPrefix(ord) && s.count > ord.count {
            s = String(s.dropFirst(ord.count))
            break
        }
        if s.hasPrefix("大"), s.count == 2, !preserveDaCore.contains(s) {
            return String(s.dropFirst())
        }
        if s.hasSuffix("朝"), s.count >= 2 {
            let trimmed = String(s.dropLast())
            if trimmed.hasPrefix("大"), trimmed.count == 2, !preserveDaCore.contains(trimmed) {
                return String(trimmed.dropFirst())
            }
            return trimmed
        }
        return s
    }

    /// 收集当前世界中所有已被占用的国名规范键集合（同时包含 `civilization.nations` 与 `world.nations`）。
    public static func usedStateKeys(_ r: JS) -> Set<String> {
        var used = Set<String>()
        if !r.civilization.isNull, !r.civilization.nations.isNull {
            for v in r.civilization.nations.objectValues {
                if let raw = v.name.value.optionalString, !raw.isEmpty {
                    used.insert(cleanStateBase(raw))
                    used.insert(canonicalStateKey(raw))
                }
                if let custom = v.name.custom.optionalString, !custom.isEmpty {
                    used.insert(cleanStateBase(custom))
                    used.insert(canonicalStateKey(custom))
                }
            }
        }
        for n in r.world.nations.asArray {
            if let name = n.name.optionalString, !name.isEmpty {
                used.insert(cleanStateBase(name))
                used.insert(canonicalStateKey(name))
            }
        }
        return used
    }

    /// 判断基名是否为纯王朝/皇室名（在现代共和/联邦/军政府政体下显得失真）。
    public static func isDynasticBase(_ raw: String, culture: String) -> Bool {
        let b = cleanStateBase(raw)
        if b.isEmpty { return false }
        if culture == "chinese" {
            if b.count == 1 { return true }
            if b.hasPrefix("大") && !preserveDaCore.contains(b) { return true }
            if chineseCompleteMonarchyTitles.contains(b) {
                // 吴越、荆楚、河西、陇右、南越、闽越、大理、中山 既是古国也是地理区名，共和体制可用
                let alsoRegion: Set<String> = ["吴越", "河西", "陇右", "闽越", "大理", "中山", "南诏", "高昌"]
                return !alsoRegion.contains(b)
            }
            return false
        }
        if let set = dynasticOnlyBases[culture], set.contains(b) { return true }
        return false
    }

    /// 当国家切换政体风格时，检查当前基名是否与新政体现实冲突；若冲突（如「大金」改共和国、「波旁」改联邦），
    /// 自动从该文化的对应现代地理池或王朝池挑选不重名的合理基名。
    public static func adaptBaseForStyle(
        base rawBase: String,
        culture: String,
        style: Regimes.Style,
        seed: String,
        used: Set<String>
    ) -> String {
        let base = cleanStateBase(rawBase)
        if modernPolityStyles.contains(style.id), isDynasticBase(base, culture: culture) {
            let pool = modernRegionStates[culture] ?? []
            if !pool.isEmpty {
                let start = Int(Opening.hash(seed + "|modern") % UInt32(pool.count))
                if let pick = (0..<pool.count).lazy.map({ pool[(start + $0) % pool.count] })
                    .first(where: { !used.contains($0) && !used.contains(canonicalStateKey($0)) }) {
                    return pick
                }
                return pool[start]
            }
        }
        // 反向：由现代地理区名如「中华」「江南」「两广」改为中华王朝/帝制时，优先换为未用的真实朝代国号，杜绝「江南帝国」「两广帝国」。
        if ["dynasty", "empire", "despotism"].contains(style.id), culture == "chinese" {
            let modernSet = Set(modernRegionStates["chinese"] ?? [])
            if base.count >= 3 || (modernSet.contains(base) && !chineseCompleteMonarchyTitles.contains(base)) {
                let pool = dynastyPool(culture: culture)
                if !pool.isEmpty {
                    let start = Int(Opening.hash(seed + "|dyn") % UInt32(pool.count))
                    if let pick = (0..<pool.count).lazy.map({ pool[(start + $0) % pool.count] })
                        .first(where: { !used.contains($0) && !used.contains(canonicalStateKey($0)) }) {
                        return pick
                    }
                }
            }
        }
        return base
    }

    /// 校验某细分政体是否符合该文化与宗教的现实历史传统（供 AI 演进与建国校验，杜绝「法兰西沙皇国」「中华教宗国」）。
    public static func isStyleAuthentic(_ styleId: String, culture: String, religion: String) -> Bool {
        switch styleId {
        case "tsardom": return culture == "slavic" || religion == "orthodox"
        case "shogunate": return culture == "japanese"
        case "sultanate": return religion == "islam" || ["arab", "turkic", "persian", "indian"].contains(culture)
        case "caliphate": return religion == "islam"
        case "papacy": return religion == "catholic"
        case "order": return religion == "catholic" || ["german", "french", "english", "spanish", "italian", "polish", "hungarian", "portuguese"].contains(culture)
        case "lamaism": return ["tantric", "buddhism", "chan", "pureLand", "tiantai"].contains(religion) || culture == "tibetan"
        case "khanate": return ["mongol", "turkic"].contains(culture)
        case "dynasty": return ["chinese", "korean", "vietnamese"].contains(culture)
        default: return true
        }
    }

    /// 各文化起义建朝/禅让专用朝代名池（完全取代 `Uprisings` 旧版狭小硬编码表）。
    public static func dynastyPool(culture: String) -> [String] {
        if culture == "chinese" {
            return [
                "汉", "唐", "宋", "明", "秦", "晋", "隋", "周", "齐", "楚", "燕", "赵", "魏", "吴", "越", "蜀", "梁", "陈", "夏", "商", "元", "辽", "金", "清",
                "大顺", "大西", "天完", "大中", "大定", "新朝", "武周",
                "西汉", "东汉", "曹魏", "蜀汉", "东吴", "西晋", "东晋",
                "北魏", "东魏", "西魏", "北齐", "北周", "南齐", "南梁", "南陈",
                "后梁", "后唐", "后晋", "后汉", "后周", "南唐", "吴越", "前蜀", "后蜀", "南汉", "北汉", "马楚", "闽",
                "北宋", "南宋", "西夏", "南明", "大理", "南诏", "西楚",
                "前秦", "后秦", "西秦", "前燕", "后燕", "南燕", "北燕", "前凉", "后凉", "西凉", "北凉", "南凉", "成汉", "胡夏",
                "鲁", "郑", "韩", "卫", "蔡", "曹", "徐", "许", "滕", "薛", "杞", "申", "吕", "邢", "樊", "莱", "虞", "随", "邓", "虢", "岐", "雍", "代", "中山",
            ]
        }
        return historicalExtraStates[culture] ?? fantasyStates[culture] ?? []
    }

    /// 清洗历史/目录国名中误带的政体或爵位尾缀（如「波兰王国」→「波兰」、「科英布拉伯」→「科英布拉」、「宋国」→「宋」）。
    public static func cleanStateBase(_ raw: String) -> String {
        var s = raw.trimmingCharacters(in: .whitespacesAndNewlines)
        if s.isEmpty { return s }
        for suffix in politySuffixes where s.hasSuffix(suffix) && s.count > suffix.count {
            s = String(s.dropLast(suffix.count))
            break
        }
        // 清理误带的单字爵位或“国/朝/部”尾缀（保留「中国」「高丽」「朝鲜」「大越」等正常称呼）。
        let trimExact: [String: String] = [
            "宋国": "宋", "蔡国": "蔡", "古格王朝": "古格", "勃艮第王朝": "勃艮第",
            "科英布拉伯": "科英布拉", "加利西亚伯": "加利西亚", "葡萄牙伯": "葡萄牙",
            "阿基坦公": "阿基坦", "勃艮第伯": "勃艮第", "荷兰伯": "荷兰",
            "布拉邦公": "布拉邦", "佛兰德伯": "佛兰德", "卢森堡公": "卢森堡",
            "莫斯科大公": "莫斯科", "伊庇鲁斯专制": "伊庇鲁斯", "鞑靼部": "鞑靼",
            "教皇国": "罗马教廷",
        ]
        if let fixed = trimExact[s] { return fixed }
        // 若是「单字+国」（如 齐国/楚国/燕国），还原为单字基名以便按政体重新拼合
        if s.hasSuffix("国"), s.count == 2, s != "中国", s != "四国", s != "韩国", s != "法国", s != "德国", s != "英国", s != "俄国", s != "美国", s != "越国" {
            return String(s.dropLast())
        }
        return s
    }

    /// 去掉国名里的政体后缀与单字朝代冠字「大」，用于地图简洁国名或剥离基名。
    public static func stripStateTitle(_ fullName: String) -> String {
        var s = fullName.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !s.isEmpty else { return s }
        for suffix in politySuffixes where s.hasSuffix(suffix) && s.count > suffix.count {
            s = String(s.dropLast(suffix.count))
            // 同时去掉如「法兰西第二共和国」剥掉「共和国」后留下的尾随序数「第二」
            for ord in ["第二", "第三", "第四", "第五", "第六"] where s.hasSuffix(ord) && s.count > ord.count {
                s = String(s.dropLast(ord.count))
                break
            }
            return s
        }
        // 仅在「大+单字朝代」且不在保留地名表中时去掉冠字「大」（如 大汉→汉、大唐→唐、大宋→宋、大明→明）。
        if s.hasPrefix("大"), s.count == 2, !preserveDaCore.contains(s) {
            return String(s.dropFirst())
        }
        // 单个“国”尾字（仅当长度 >= 2 且非固定国名）
        if s.hasSuffix("国"), s.count >= 2, s != "中国", s != "四国", s != "韩国" {
            return String(s.dropLast())
        }
        return s
    }

    /// 渲染国家完整称谓，支持模板占位符 `{名}`（基名）、`{号}`（政体后缀）、`{序}`（复国序号）、`{姓}`（统治家族姓氏）。
    /// 无模板时严格按文化与政体规律给出真实自然的称呼：
    /// - 杜绝「大金共和国」「北宋王国」「大顺帝国」「波兰王国王国」「第二大金」等不合现实的拼接；
    /// - 复辟/重建序数按中文史学习惯排布（如「法兰西第二共和国」「罗马第二帝国」，中华王朝复国称「后汉」「南宋」「续明」）。
    public static func formatStateTitle(
        base rawBase: String,
        style: Regimes.Style,
        religion: String,
        culture: String,
        ordinal: String,
        rulingSurname: String,
        template: String?
    ) -> String {
        let base = cleanStateBase(rawBase)
        let effectiveSuffix: String = {
            if style.id == "theocracy" || style.id == "holy" {
                switch religion {
                case "islam": return style.id == "holy" ? "伊玛目国" : "哈里发国"
                case "catholic": return style.id == "holy" ? "圣座领" : "教宗国"
                case "orthodox": return "牧首领"
                case "protestant": return "圣约邦"
                case "buddhism", "chan", "pureLand", "tiantai", "tantric": return "法王领"
                case "shinto": return "神宫领"
                case "hinduism", "zoroastrian": return "法王国"
                default:
                    if culture == "chinese" { return style.id == "holy" ? "教廷" : "道国" }
                    return "教宗领"
                }
            }
            if style.id == "dynasty" { return "朝" }
            if style.id == "junta" { return "军政府" }
            if style.id == "dictatorship" { return culture == "chinese" ? "执政府" : "独裁国" }
            if style.id == "fascist" { return culture == "italian" ? "社会共和国" : "民族国" }
            if style.id == "nazi" { return culture == "german" ? "帝国" : "民族国" }
            if style.id == "lamaism" { return "法王国" }
            if style.suffix.isEmpty {
                return Regimes.titles[style.base] ?? ""
            }
            return style.suffix
        }()
        let surname = cleanSurname(rulingSurname)

        if let t = template?.trimmingCharacters(in: .whitespacesAndNewlines), !t.isEmpty {
            let hasOrdinalToken = t.contains("{序}")
            let nameValue = hasOrdinalToken ? base : ordinal + base
            var out = t
                .replacingOccurrences(of: "{序}", with: ordinal)
                .replacingOccurrences(of: "{名}", with: nameValue)
                .replacingOccurrences(of: "{号}", with: effectiveSuffix)
                .replacingOccurrences(of: "{姓}", with: surname.isEmpty ? base : surname)
            out = out.trimmingCharacters(in: .whitespacesAndNewlines)
            if !out.isEmpty { return out }
        }

        // 1. 中华/东亚王朝与封建君主称谓：严格贴近真实史书称法
        if culture == "chinese" {
            let isMonarchy = ["dynasty", "empire", "despotism", "absolute", "feudal", "regency", "principality", "elective", "constitutional"].contains(style.id)
            if style.id == "dynasty" {
                let core = canonicalStateKey(base)
                if core.count == 1 && (base.count == 1 || (base.hasPrefix("大") && base.count == 2)) {
                    if ordinal.isEmpty { return "大" + core }
                    return (ordinal == "第二" ? "后" : ordinal == "第三" ? "南" : "续") + core
                }
                if chineseCompleteMonarchyTitles.contains(base) {
                    if ordinal.isEmpty { return base }
                    let stripped = base.hasPrefix("大") ? String(base.dropFirst()) : base
                    return (ordinal == "第二" ? "后" : "续") + stripped
                }
                return ordinal.isEmpty ? base + "朝" : "续" + base
            }
            if isMonarchy {
                // 双字完整朝代号（如 北魏、南唐、蜀汉、吴越、西夏、大理、大顺、南明）：绝不乱加「王国/帝国」
                if chineseCompleteMonarchyTitles.contains(base) {
                    if style.id == "constitutional" { return base + "立宪国" }
                    if ordinal.isEmpty { return base }
                    let stripped = base.hasPrefix("大") ? String(base.dropFirst()) : base
                    return (ordinal == "第二" ? "后" : "续") + stripped
                }
                // 单字国号：王制/公国称「齐国/楚国/晋公国」，帝制称「大秦/大汉」，立宪称「大齐立宪国」
                if base.count == 1 {
                    if style.id == "principality" { return (ordinal.isEmpty ? "" : "后") + base + "公国" }
                    if style.id == "constitutional" { return (ordinal.isEmpty ? "大" : "后") + base + "立宪国" }
                    if style.base == "Kingdom" { return (ordinal.isEmpty ? "" : "后") + base + "国" }
                    if style.base == "Empire" { return ordinal.isEmpty ? "大" + base : "后" + base }
                }
                // 地理双字名（如 江南、关中、巴蜀、岭南）：称「江南王府/王国」「巴蜀公国」「中华帝国」，避免生硬拼接
                if style.id == "principality" { return base + ordinal + "公国" }
                if style.id == "constitutional" { return base + ordinal + "立宪王国" }
                if style.base == "Empire" { return (base == "中华" || base == "华夏") ? base + ordinal + "帝国" : base + ordinal + "王朝" }
                if style.base == "Kingdom" { return base + ordinal + "王国" }
            }
            if style.id == "warlord" || style.id == "junta" { return base + "军政府" }
            if style.id == "dictatorship" { return base + "执政府" }
            if style.id == "peasant" { return base + "义军" }
            if style.id == "holy" { return base == "太平" ? "太平天国" : base + "教廷" }
            if style.id == "theocracy" { return base == "天师" ? "天师道领" : base + (religion == "buddhism" || religion == "tantric" ? "法王领" : "教廷") }
            if style.id == "tribal" || style.id == "chiefdom" { return base + "部" }
            if style.id == "khanate" { return base + "汗国" }
            if style.id == "democratic" || style.id == "presidential" || style.id == "parliamentary" {
                if base == "中华" && ordinal.isEmpty { return "中华民国" }
                return base + ordinal + "共和国"
            }
            if style.id == "communist" { return base + ordinal + "人民共和国" }
            if style.id == "socialist" { return base + ordinal + "社会主义共和国" }
        }

        // 1b. 日本幕府/帝国与经典文化特例
        if culture == "japanese" {
            if style.id == "shogunate" { return base.hasSuffix("幕府") ? base : base + "幕府" }
            if style.id == "empire" && base == "日本" && ordinal.isEmpty { return "大日本帝国" }
        }
        if culture == "french" && style.id == "anarchist" && (base == "法兰西" || base == "巴黎") && ordinal.isEmpty { return "\(base)公社" }
        if culture == "english" && style.id == "union" && (base == "不列颠" || base == "英格兰") && ordinal.isEmpty { return "大不列颠联合王国" }
        if culture == "german" && (style.id == "nazi" || style.id == "fascist") && base == "德意志" { return "德意志\(ordinal.isEmpty ? "第三" : ordinal)帝国" }

        // 2. 其余文化「新朝/王朝」政体
        if style.id == "dynasty" {
            if base.count == 1 {
                return ordinal.isEmpty ? "大" + base : "后" + base
            }
            if base.hasPrefix("大") || ["东", "西", "南", "北", "前", "后"].contains(where: { base.hasPrefix($0) }) {
                return ordinal.isEmpty ? base : "后" + base
            }
            return base + ordinal + "王朝"
        }

        // 3. 防止重复后缀：若基名已包含该政体后缀或完整政体词，不再叠拼。
        if !effectiveSuffix.isEmpty {
            if base.hasSuffix(effectiveSuffix) { return base + ordinal }
            if politySuffixes.contains(where: { base.hasSuffix($0) }) { return base }
            if effectiveSuffix == "国", (base.hasSuffix("国") || base.hasSuffix("朝") || base.hasSuffix("廷")) {
                return base
            }
        }
        // 4. 通用史学序数顺序：「法兰西第二共和国」「罗马第二帝国」「德意志第二帝国」
        return base + ordinal + effectiveSuffix
    }

    /// 供界面展示的国名模板预设（具名结构体，保证 Swift 5 `ForEach` 稳定编译）。
    public struct TemplatePreset: Sendable, Identifiable, Equatable {
        public let label: String
        public let template: String
        public var id: String { label }
        public init(label: String, template: String) { self.label = label; self.template = template }
    }
    public static let templatePresets: [TemplatePreset] = [
        TemplatePreset(label: "默认（随政体）", template: ""),
        TemplatePreset(label: "大{名}", template: "大{名}"),
        TemplatePreset(label: "{名}{号}", template: "{名}{号}"),
        TemplatePreset(label: "{名}{序}{号}", template: "{名}{序}{号}"),
        TemplatePreset(label: "{序}{名}{号}", template: "{序}{名}{号}"),
        TemplatePreset(label: "大{名}王朝", template: "大{名}王朝"),
        TemplatePreset(label: "{姓}氏{名}", template: "{姓}氏{名}"),
        TemplatePreset(label: "大{姓}", template: "大{姓}"),
    ]

    // MARK: - 26 种文化的纯净历史国名补充库（全部为纯基名，绝不含政体/爵位尾缀）

    public static let historicalExtraStates: [String: [String]] = [
        "chinese": [
            "商", "殷", "西周", "东周", "新", "后汉", "曹魏", "蜀汉", "东吴", "西晋", "东晋",
            "前秦", "后秦", "北魏", "东魏", "西魏", "北齐", "北周", "南齐", "南梁", "南陈", "武周",
            "后梁", "后唐", "后晋", "后周", "南唐", "吴越", "前蜀", "后蜀", "南汉", "北汉", "闽", "马楚",
            "西夏", "大理", "南诏", "北宋", "南宋", "大顺", "南明", "大西", "天完", "大中", "大定", "清",
            "中山", "巴", "滇", "夜郎", "徐", "莒", "邾", "曹", "虢", "随", "邓", "许", "息", "代",
            "西凉", "北凉", "南燕", "后燕", "成汉", "前燕", "前凉", "南凉", "西秦", "胡夏", "北燕", "高昌", "吐谷浑",
            "前赵", "后赵", "后凉", "东夏", "西辽", "北辽", "南平", "荆南", "清源", "定难", "归义", "南越", "闽越", "东瓯",
            "西楚", "且兰", "句町", "滕", "薛", "杞", "申", "吕", "邢", "樊", "莱", "虞", "雍", "岐", "滑", "纪", "沈", "黄", "江", "舒",
        ],
        "japanese": [
            "尾张", "甲斐", "越后", "相模", "骏河", "安艺", "萨摩", "土佐", "出羽", "陆奥",
            "近江", "美浓", "备前", "丰后", "肥前", "伊予", "阿波", "加贺", "能登", "越前",
            "若狭", "丹波", "但马", "因幡", "伯耆", "石见", "周防", "筑前", "筑后", "日向",
            "大隅", "琉球", "虾夷", "常陆", "下野", "上野", "飞驒", "纪伊", "肥后", "越中",
            "赞岐", "备中", "备后", "美作", "淡路", "和泉", "河内", "摄津", "伊贺", "志摩",
            "长门", "播磨", "信浓", "武藏", "三河", "远江", "伊豆", "安房", "上总", "下总", "磐城", "岩代", "对马", "壹岐",
        ],
        "english": [
            "约克", "兰开斯特", "诺福克", "苏格兰", "威尔士", "格温内斯", "波伊斯", "德赫巴斯",
            "斯特拉思克莱德", "皮克特", "达尔里亚达", "林赛", "赫威赛", "德伊勒", "伯尼西亚",
            "爱尔兰", "康诺特", "阿尔斯特", "伦斯特", "芒斯特", "马恩", "麦西亚", "诺森布里亚", "苏塞克斯",
            "萨里", "伯克郡", "德文", "萨默塞特", "多塞特", "汉普郡", "柴郡", "达勒姆", "诺森伯兰", "法夫", "洛锡安", "阿盖尔",
        ],
        "arab": [
            "法蒂玛", "阿尤布", "马穆鲁克", "阿格拉布", "伊德里斯", "图伦", "伊赫希德", "哈姆丹",
            "穆拉比特", "穆瓦希德", "哈夫斯", "马林", "宰亚尼", "拉苏勒", "齐亚德", "苏莱赫",
            "卡尔马特", "希拉", "巴林", "哈德拉毛", "科尔多瓦", "格拉纳达", "汉志", "叙利亚",
            "阿曼", "内志", "也门", "的黎波里", "摩苏尔", "阿勒颇", "大马士革", "突尼斯", "非斯", "马拉喀什", "阿西尔", "赞吉",
        ],
        "roman": [
            "西罗马", "东罗马", "苏瓦松", "帕尔米拉", "高卢", "不列颠尼亚", "毛里塔尼亚", "努米底亚",
            "卡帕多细亚", "本都", "比提尼亚", "亚美尼亚", "加拉提亚", "色雷斯", "默西亚", "伊利里库姆",
            "诺里库姆", "雷蒂亚", "撒丁尼亚", "科西嘉", "阿奎塔尼亚", "纳博讷", "基里基亚",
            "卢西塔尼亚", "贝提卡", "塔拉科", "比利时高卢", "日耳曼尼亚", "阿哈伊亚", "昔兰尼加", "犹太", "美索不达米亚",
        ],
        "french": [
            "卡佩", "瓦卢瓦", "波旁", "奥尔良", "阿基坦", "加斯科涅", "佛兰德", "皮卡第",
            "贝里", "奥弗涅", "多菲内", "萨伏依", "里昂", "阿图瓦", "利穆赞", "普瓦图",
            "朗格多克", "鲁西永", "法兰克", "纽斯特里亚", "奥斯特拉西亚", "阿尔萨斯", "曼恩", "图赖讷",
            "波尔多", "布卢瓦", "尼韦尔奈", "波旁奈", "佩里戈尔", "阿尔马尼亚克", "富瓦", "贝阿恩", "弗朗什孔泰",
        ],
        "german": [
            "霍亨斯陶芬", "霍亨索伦", "哈布斯堡", "维特尔斯巴赫", "韦尔夫", "梅克伦堡", "波美拉尼亚",
            "荷尔斯泰因", "石勒苏益格", "不伦瑞克", "卢森堡", "科隆", "美因茨", "特里尔", "巴登",
            "安哈尔特", "奥尔登堡", "条顿", "汉萨", "东法兰克", "西里西亚", "卡林西亚", "施蒂利亚", "蒂罗尔",
            "威斯特伐利亚", "拿骚", "马格德堡", "纽伦堡", "莱茵", "瑞士", "吕贝克", "不来梅", "汉堡", "法兰克福", "乌尔姆",
        ],
        "greek": [
            "阿尔戈斯", "麦加拉", "叙拉古", "米利都", "以弗所", "萨摩斯", "开俄斯", "克里特",
            "塞浦路斯", "帕加马", "塞琉古", "托勒密", "安提柯", "本都", "博斯普鲁斯", "特拉布宗",
            "伊庇鲁斯", "尼西亚", "摩里亚", "阿卡迪亚", "福基斯", "皮洛斯", "罗得", "昔兰尼",
            "哈尔基斯", "埃雷特里亚", "科孚", "莱斯博斯", "纳克索斯", "帕罗斯", "拉里萨", "色萨洛尼卡", "马萨利亚",
        ],
        "persian": [
            "萨法维", "阿夫沙尔", "赞德", "卡扎尔", "伽色尼", "萨曼", "布韦希", "塔希尔",
            "萨法尔", "齐亚尔", "卡库伊", "穆扎法尔", "帖木儿", "黑羊", "白羊", "贵霜",
            "阿兰", "达伊拉姆", "马赞达兰", "塔巴里斯坦", "阿塞拜疆", "克尔曼",
            "伊斯法罕", "设拉子", "大不里士", "赫拉特", "巴尔赫", "内沙布尔", "梅尔夫", "胡齐斯坦", "洛雷斯坦",
        ],
        "slavic": [
            "弗拉基米尔", "苏兹达尔", "梁赞", "特维尔", "普斯科夫", "加利奇", "沃伦", "切尔尼戈夫",
            "斯摩棱斯克", "波洛茨克", "大摩拉维亚", "斯洛文尼亚", "杜克利亚", "波斯尼亚", "拉什卡", "泽塔",
            "莫斯科", "白罗斯", "鲁塞尼亚", "喀尔巴阡", "罗斯托夫", "佩列亚斯拉夫", "图罗夫",
            "穆罗姆", "雅罗斯拉夫尔", "下诺夫哥罗德", "维亚特卡", "彼尔姆", "西伯利亚", "扎波罗热", "黑山", "斯洛伐克",
        ],
        "norse": [
            "卡尔马", "芬兰", "法罗", "设得兰", "马恩", "诺曼", "格陵兰", "赫布里底",
            "阿格德", "霍洛加兰", "乌普兰", "斯维阿", "约姆", "罗斯", "瓦良格",
            "西约特兰", "东约特兰", "斯莫兰", "文兰", "奥普兰", "博胡斯", "耶姆特兰", "达拉纳", "石勒苏益格", "斯科讷",
        ],
        "indian": [
            "孔雀", "笈多", "贵霜", "萨塔瓦哈纳", "遮娄其", "帕拉瓦", "拉什特拉库塔", "波罗",
            "普拉蒂哈拉", "毗奢耶那伽罗", "巴赫曼尼", "马拉塔", "拉其普特", "锡克", "莫卧儿", "德里",
            "孟加拉", "古吉拉特", "迈索尔", "海得拉巴", "旁遮普", "克什米尔", "阿萨姆", "奥里萨",
            "梅瓦尔", "马尔瓦尔", "斋浦尔", "信德", "马尔瓦", "比贾布尔", "戈尔康达", "特拉凡哥尔", "尼泊尔", "兰卡",
        ],
        "korean": [
            "加耶", "金官", "大伽倻", "泰封", "摩震", "卒本", "北扶余", "马韩",
            "辰韩", "弁韩", "乐浪", "带方", "于山", "真番", "临屯", "箕子", "卫满", "后高句丽",
            "南扶余", "东沃沮", "东濊", "庆尚", "全罗", "忠清", "江原", "平安", "咸镜",
        ],
        "mongol": [
            "大蒙古", "金帐", "蓝帐", "白帐", "窝阔台", "鞑靼", "科尔沁", "察哈尔",
            "喀尔喀", "土默特", "鄂尔多斯", "和硕特", "杜尔伯特", "土尔扈特", "辉特",
            "汪古", "弘吉剌", "斡亦剌", "札剌亦儿", "泰赤乌", "伊儿", "察合台",
            "布里亚特", "卡尔梅克", "克烈", "乃蛮", "漠北", "漠南", "卫拉特", "阿拉善",
        ],
        "turkic": [
            "阿瓦尔", "可萨", "保加尔", "佩切涅格", "乌古斯", "葛逻禄", "黠戛斯", "沙陀",
            "高昌", "甘州", "加兹尼", "卡拉曼", "达尼什曼德", "杜尔卡迪尔", "黑羊", "喀山",
            "阿斯特拉罕", "克里米亚", "西伯利亚", "希瓦", "布哈拉", "浩罕", "塞尔柱", "鲁姆",
            "诺盖", "哈萨克", "乌兹别克", "土库曼", "艾登", "门泰谢", "盖尔米扬", "萨鲁汗",
        ],
        "egyptian": [
            "阿玛尔纳", "赫利奥波利斯", "希克索斯", "塔尼斯", "纳帕塔", "阿克苏姆", "布托", "涅亨",
            "希拉孔波利斯", "阿拜多斯", "象岛", "法尤姆", "卢克索", "卡纳克", "萨卡拉", "锡瓦",
            "菲莱", "丹德拉", "塞易斯", "阿斯旺", "亚历山大", "达米埃塔", "罗塞塔", "孟斐斯", "努比亚",
        ],
        "spanish": [
            "西哥特", "苏维汇", "巴伦西亚", "穆尔西亚", "巴达霍斯", "塞维利亚", "托莱多", "潘普洛纳",
            "乌赫尔", "巴塞罗那", "加利西亚", "安达卢斯", "阿尔梅里亚", "马拉加", "莱昂", "比斯开",
            "埃斯特雷马杜拉", "坎塔布里亚", "科尔多瓦", "萨拉戈萨", "马略卡", "里奥哈", "卡迪斯", "萨拉曼卡",
        ],
        "italian": [
            "费拉拉", "摩德纳", "帕尔马", "比萨", "锡耶纳", "卢卡", "乌尔比诺", "拉韦纳",
            "阿马尔菲", "加埃塔", "贝内文托", "斯波莱托", "弗留利", "阿奎莱亚", "蒙费拉", "萨卢佐",
            "伦巴第", "东哥特", "西西里", "那不勒斯", "皮埃蒙特", "卡拉布里亚", "翁布里亚", "博洛尼亚", "维罗纳", "帕多瓦",
        ],
        "vietnamese": [
            "万春", "交趾", "九真", "日南", "林邑", "扶南", "真腊", "占婆",
            "南掌", "西山", "广南", "升龙", "顺化", "清化", "义安", "嘉定", "河仙", "北宁",
            "安南", "高平", "谅山", "海阳", "山南", "宣光",
        ],
        "tibetan": [
            "雅隆", "古格", "阿里", "贡塘", "仁蚌", "辛厦", "藏巴", "甘丹",
            "德格", "囊谦", "江孜", "芒域", "工布", "达布", "羊同", "木雅", "拉萨", "萨迦",
            "拉达克", "卫藏", "安多", "康巴", "日喀则", "昌都",
        ],
        "hungarian": [
            "阿尔帕德", "安茹", "匈雅提", "潘诺尼亚", "瓦拉几亚", "摩尔达维亚", "马扎尔",
            "外多瑙", "上蒂萨", "下蒂萨", "巴拉顿", "佩奇", "埃格尔", "德布勒森", "布达",
            "斯拉沃尼亚", "达尔马提亚", "巴纳特", "特兰西瓦尼亚", "塞凯伊",
        ],
        "polish": [
            "皮雅斯特", "雅盖隆", "立陶宛", "西里西亚", "克拉科夫", "桑多梅日", "文奇察", "西拉兹",
            "普沃茨克", "格涅兹诺", "海乌姆", "鲁塞尼亚", "普鲁士", "利沃尼亚", "华沙", "波兹南",
            "马佐维亚", "波美拉尼亚", "库亚维", "波德拉谢", "卢布林",
        ],
        "portuguese": [
            "阿维什", "布拉干萨", "加利西亚", "波尔图", "里斯本", "科英布拉", "埃武拉", "贝雅",
            "布拉加", "法鲁", "阿连特茹", "米尼奥", "贝拉", "马德拉", "亚速尔", "阿尔加维",
            "圣塔伦", "莱里亚", "维塞乌", "吉马良斯",
        ],
        "dutch": [
            "海尔德", "林堡", "列日", "布拉邦", "佛兰德", "埃诺", "那慕尔", "卢森堡",
            "联省", "巴达维亚", "泽兰", "弗里斯兰", "乌得勒支", "格罗宁根", "德伦特", "上艾瑟尔",
            "阿姆斯特丹", "鹿特丹", "安特卫普", "根特", "布鲁日",
        ],
        "aztec": [
            "奥尔梅克", "特奥蒂瓦坎", "托托纳克", "瓦斯特克", "塔拉斯坎", "奥托米", "乔卢拉", "韦霍钦科",
            "库尔瓦坎", "阿斯卡波察尔科", "霍奇米尔科", "查尔科", "玛雅潘", "奇琴伊察", "乌斯马尔", "蒂卡尔", "帕伦克", "科潘",
            "特拉斯卡拉", "瓦哈卡", "米特拉", "特斯科科", "特拉科潘",
        ],
        "inca": [
            "瓦里", "蒂瓦纳科", "莫切", "纳斯卡", "帕拉卡斯", "查文", "卢帕卡", "科利亚",
            "钱卡", "瓦尔帕", "卡尼亚里", "帕尔塔", "马普切", "艾马拉", "孔蒂苏尤", "维尔卡班巴",
            "基多", "奇穆", "卡哈马卡", "阿雷基帕", "钦查",
        ],
    ]

    // MARK: - 架空（按文化生成）专用高质量国名构词库（无叠字、无腰斩拼词）

    /// 中华架空单字雅致古国号 + 双字词根（避免「安安」「平平」「宁宁」）。
    public static let chineseFantasySingles: [String] = [
        "岐", "雍", "樊", "邢", "滕", "薛", "莱", "杞", "申", "吕", "巢", "舒", "弦", "黄", "道", "柏",
        "随", "虞", "冀", "青", "徐", "扬", "荆", "豫", "益", "并", "朔", "云", "恒", "定", "沧", "瀛",
        "衡", "岳", "湘", "淮", "泗", "沂", "洛", "伊", "渭", "泾", "汾", "沁", "洮", "澜", "景", "宣",
        "昭", "宁", "安", "康", "昌", "泰", "和", "兴", "隆", "盛", "贞", "嘉", "熙", "乾", "坤", "靖",
    ]

    /// 各文化地道架空国名池（按文化音韵整词设计，剔除年号与域外词，替代原有腰斩拼接词）。
    public static let fantasyStates: [String: [String]] = [
        "chinese": chineseFantasySingles + [
            "琅琊", "广陵", "彭城", "姑苏", "会稽", "汉中", "敦煌", "襄阳", "寿春", "临淄",
            "晋阳", "邺城", "上党", "江陵", "番禺", "建康", "金陵", "武昌", "姑臧", "朔方",
            "云中", "宛陵", "南阳", "河内", "东平", "淮阳", "陈留", "颍川", "汝南", "弘农",
            "京兆", "天水", "安定", "北地", "云梦", "苍梧", "潇湘", "河洛", "关中", "青齐",
            "荆楚", "巴蜀", "吴越", "三晋", "陇右", "河西", "岭南", "剑南", "幽燕", "辽东",
        ],
        "japanese": [
            "瑞穗", "丰苇", "秋津", "扶桑", "朝阳", "青原", "春野", "白川", "松风", "藤原",
            "樱川", "若狭", "高天", "明石", "长谷", "橘湾", "鹤冈", "雪见", "月影", "星野",
            "红叶", "霜月", "神无", "水无", "如月", "弥生", "卯月", "皋月", "叶月", "长月",
        ],
        "english": [
            "阿瓦隆", "卡美洛", "诺森兰", "韦斯特兰", "格林代尔", "布莱克伍德", "怀特霍尔", "雷文斯堡",
            "斯通布里奇", "阿什福德", "金斯顿", "温德米尔", "奥克赫斯特", "霍克伍德", "罗斯代尔", "布赖尔顿",
            "哈特菲尔德", "埃尔德米尔", "索斯威克", "伊斯顿", "奥尔德堡", "米尔布鲁克", "克利夫顿", "威洛代尔",
        ],
        "arab": [
            "努尔斯坦", "盖迈尔", "萨法维亚", "瓦迪阿勒", "巴赫尔", "奈希勒", "宰赫拉", "费吉尔",
            "哈杰尔", "杰拜勒", "盖斯尔", "萨拉姆", "纳吉姆", "泽伊通", "阿萨德", "达赫卜",
            "法拉赫", "纳赛尔", "里雅德", "马纳尔", "沙尔基亚", "盖尔比亚", "阿卜耶德", "艾赫达尔",
        ],
        "roman": [
            "奥勒利亚", "瓦莱里亚", "克劳迪亚", "弗拉维亚", "卡斯特拉", "马尔提亚", "尤利安纳", "科尔内利亚",
            "奥古斯塔", "塞维利亚", "西尔瓦尼亚", "阿奎莱亚", "福尔图纳", "维罗尼亚", "阿尔比翁", "阿尔根塔",
            "马格努斯", "诺瓦里亚", "哈德里亚", "安东尼亚", "康斯坦提亚", "提贝里亚", "萨比尼亚", "拉丁尼亚",
        ],
        "french": [
            "克莱尔蒙", "贝勒维尔", "罗什福尔", "瓦尔蒙", "蒙特福尔", "丰特奈", "博蒙", "奥布瓦",
            "弗勒里", "皮埃尔堡", "韦尔蒙", "圣克莱尔", "格朗维尔", "布朗什", "阿让顿", "多尔多涅",
            "布勒塔涅", "索勒尔", "吕内维尔", "沙尔瓦尔", "蓬图瓦兹", "谢纳堡", "诺瓦尔", "里昂奈",
        ],
        "german": [
            "阿德勒堡", "罗森海姆", "法尔肯贝格", "艾兴瓦尔德", "施泰因费尔德", "霍恩施泰因", "格林塔尔",
            "松嫩贝格", "西尔伯堡", "艾森豪森", "沃尔夫斯堡", "希尔施塔尔", "拉本施泰因", "魏森堡",
            "施瓦岑贝格", "戈尔登海姆", "科尼希斯堡", "林登瓦尔德", "比尔肯费尔德", "诺伊恩堡", "阿尔滕堡", "米伦巴赫",
        ],
        "greek": [
            "赫利奥波利斯", "阿克罗波利斯", "尼科波利斯", "卡利波利斯", "阿斯特里亚", "琉科西亚", "罗多波利斯",
            "克里索波利斯", "佩特拉", "塔拉西亚", "帕莱奥波利斯", "梅索波利斯", "迈加洛波利斯", "奥雷斯提亚",
            "卡斯特利亚", "德尔福斯", "阿波罗尼亚", "赫拉克利亚", "狄奥尼西亚", "塞萨洛尼亚", "阿耳忒弥亚", "伊奥尼亚",
        ],
        "persian": [
            "梅赫拉巴德", "阿扎尔斯坦", "罗珊沙赫尔", "法尔斯坦", "沙赫里亚尔", "古尔斯坦", "巴赫拉姆",
            "扎林沙赫尔", "库赫斯坦", "霍拉姆沙赫尔", "菲鲁扎巴德", "帕尔萨", "塞塔雷", "戈哈尔斯坦",
            "萨布泽瓦尔", "塞菲德鲁德", "尼克沙赫尔", "阿米达巴德", "达里亚斯坦", "西敏坎德", "努什阿巴德", "纳瓦斯坦",
        ],
        "slavic": [
            "诺沃格勒", "别洛哥罗德", "切尔诺夫", "泽列诺格勒", "斯韦特洛亚尔", "韦利科波尔", "多布罗米尔",
            "米罗斯拉夫", "拉多米尔", "雅罗斯拉夫", "兹拉托乌斯特", "谢列布罗夫", "杜布罗夫", "卡梅诺戈尔斯克",
            "莱斯诺伊", "斯塔罗杜布", "维索科格勒", "沃尔科夫", "索科洛夫", "奥尔洛夫", "克拉斯诺亚尔", "波莫里亚",
        ],
        "norse": [
            "赫拉夫维克", "比约恩海姆", "埃克峡湾", "霍尔姆加德", "斯泰因堡", "索尔海姆", "弗罗斯特马克",
            "斯科格达尔", "诺尔兰", "瓦尔格海姆", "法尔克内斯", "林德霍尔姆", "阿斯加德", "米德加德",
            "乌尔夫堡", "雷恩峡湾", "伯克岛", "格兰维克", "菲耶尔达尔", "斯诺海姆", "桑德港", "于勒马克",
        ],
        "indian": [
            "苏利耶普尔", "旃陀罗那加尔", "拉特纳加尔", "毗阇耶普拉", "阿难陀普尔", "提婆格拉姆", "波德摩伐蒂",
            "鸠摩罗德什", "阇耶普尔", "珊蒂瓦纳", "尼拉吉里", "索那加尔", "阿摩罗伐蒂", "室利那加尔",
            "罗阇普拉", "摩诃德什", "恒伽普尔", "因陀罗普拉", "达摩曼荼罗", "萨蒂亚普尔", "悉陀加尔", "婆苏德什",
        ],
        "korean": [
            "汉阳", "庆源", "全罗", "忠清", "光山", "清风", "平安", "咸镜",
            "江原", "黄海", "开宁", "碧澜", "白马", "锦江", "太白", "金刚",
            "汉拿", "雪岳", "智异", "洛东", "大同", "鸭绿", "豆满", "青丘",
        ],
        "mongol": [
            "哈拉和林", "斡难河", "克鲁伦", "杭爱山", "色楞格", "额尔古纳", "鄂尔浑", "阴山",
            "阿尔泰", "肯特山", "呼伦贝尔", "锡林郭勒", "巴彦淖尔", "阿拉善", "乌兰察布", "通辽",
            "伊克昭", "昭乌达", "哲里木", "卓索图", "库伦", "乌里雅苏台",
        ],
        "turkic": [
            "阿史那", "于都斤", "热海", "碎叶", "怛罗斯", "铁门", "白水", "黑山",
            "金山", "天山", "葱岭", "伊犁", "塔里木", "锡尔", "阿姆", "咸海",
            "里海", "乌拉尔", "伏尔加", "钦察", "乌古斯", "回鹘",
        ],
        "egyptian": [
            "阿蒙城", "拉神谷", "荷鲁斯堡", "奥西里斯", "伊西斯洲", "尼罗三角", "红海湾", "金沙洲",
            "白墙城", "百门城", "太阳城", "黑土国", "芦苇原", "莲花湾", "纸莎草洲", "狮身谷",
            "绿洲城", "象牙港", "法老谷", "星辰庙",
        ],
        "spanish": [
            "瓦尔德拉", "蒙特阿尔托", "卡斯蒂略", "圣地亚", "索尔维亚", "科斯塔贝尔", "里奥格兰德", "塞拉布兰卡",
            "阿尔卡萨尔", "维拉诺瓦", "坎波维德", "普埃尔托索尔", "托雷罗哈", "拉帕尔马", "阿兰达", "莫雷利亚",
            "瓦伦蒂亚", "阿斯图里亚", "伊比利亚", "安达拉",
        ],
        "italian": [
            "瓦尔贝拉", "蒙特奇亚罗", "菲奥伦蒂亚", "卡斯特尔诺沃", "圣马可", "贝拉维斯塔", "波尔托菲诺", "里维埃拉",
            "托斯卡诺", "伦巴尔迪亚", "拉齐奥", "阿布鲁佐", "坎帕诺", "普利亚", "利古里亚", "艾米利亚",
            "威尼托", "马尔凯", "特伦蒂诺", "萨莱尼亚",
        ],
        "vietnamese": [
            "升龙", "安宁", "太平", "广宁", "清化", "富春", "嘉定", "永隆",
            "海阳", "山南", "京北", "宣光", "兴安", "南定", "河静", "广平",
            "平定", "庆和", "美萩", "西宁", "高平", "谅山",
        ],
        "tibetan": [
            "雪域", "雅鲁", "冈底斯", "念青", "纳木错", "羊卓", "玛旁", "羌塘",
            "康巴", "安多", "卫藏", "琼结", "泽当", "日喀则", "昌都", "林芝",
            "山南", "那曲", "阿里", "德格",
        ],
        "hungarian": [
            "多瑙堡", "蒂萨瓦尔", "巴拉顿", "帕诺尼亚", "阿尔福德", "卡尔帕特", "马扎尔瓦尔", "圣伊什特万",
            "科马罗姆", "维谢格拉德", "埃斯泰尔", "绍普朗", "久尔瓦尔", "松博特", "托考伊", "塞格德",
        ],
        "polish": [
            "维斯瓦", "奥得兰", "马佐维亚", "波美拉尼亚", "库亚维亚", "小波兰", "大波兰", "波德拉谢",
            "桑多梅日", "喀尔巴阡", "波利西亚", "沃里尼亚", "卡舒比亚", "热舒夫", "卢布林", "托伦",
        ],
        "portuguese": [
            "卢西塔尼亚", "塔霍湾", "杜罗谷", "米尼奥", "阿连特茹", "阿尔加维", "贝拉海", "埃斯特雷马",
            "吉马良斯", "辛特拉", "科英布拉", "布拉加", "法鲁港", "圣塔伦", "莱里亚", "维塞乌",
        ],
        "dutch": [
            "须德海", "莱茵口", "马斯河", "斯海尔德", "低地", "弗里斯兰", "泽兰", "布拉班特",
            "海尔德兰", "乌得勒支", "格罗宁根", "林堡", "德伦特", "北荷兰", "南荷兰", "瓦登海",
        ],
        "aztec": [
            "阿兹特兰", "特斯科科", "特诺奇", "特拉科潘", "乔卢拉", "特拉斯卡拉", "霍奇米尔科", "库奥瓦坎",
            "查尔科", "特奥蒂瓦坎", "托兰", "瓦哈卡", "米特拉", "帕潘特拉", "奇琴", "蒂卡尔",
        ],
        "inca": [
            "印蒂城", "库斯科", "马丘比丘", "奥扬泰", "皮萨克", "卡哈马卡", "的的喀喀", "乌鲁班巴",
            "阿亚库乔", "纳斯卡", "阿雷基帕", "蒂瓦纳库", "帕拉卡斯", "瓦努科", "维尔卡班巴", "帕查卡马克",
        ],
    ]

    // MARK: - 26 种文化的纯净人名与家族姓氏库（彻底剔除姓氏混入名、性别错位、头衔/世数/年号、家/人/氏尾缀）

    public struct CulturePeople: Sendable {
        public let male: [String]
        public let female: [String]
        public let houses: [String]
    }

    public static let people: [String: CulturePeople] = [
        "chinese": CulturePeople(
            male: [
                "文昭", "景明", "承安", "弘毅", "元清", "仲衡", "子谦", "德宁", "怀远", "允和",
                "世宁", "景行", "子轩", "承志", "明德", "怀瑾", "明远", "彦博", "思齐", "修文",
                "敬业", "克明", "正卿", "彦章", "子昂", "玄龄", "如晦", "仁贵", "敬德", "叔宝",
                "知节", "子仪", "光弼", "秀实", "匡胤", "彦卿", "仁美", "延昭", "继业", "世忠",
                "允文", "善长", "遇春", "文忠", "继光", "大猷", "居正", "守仁", "廷弼", "崇焕",
                "可法", "成功", "宗棠", "国藩", "鸿章", "宝桢", "之洞", "嗣同", "思远", "致远",
                "安国", "定远", "广德", "守正", "敬之", "延年", "仲宣", "永叔", "鲁直", "少游",
                "去病", "无忌", "德裕", "公权", "希文", "君实", "介甫", "子瞻", "子由", "弃疾",
                "放翁", "天祥", "世杰", "伯温", "景隆", "于谦", "廷和", "清臣", "元辅", "应龙",
                "承宗", "象升", "煌言", "定国", "廷玉", "敏中", "则徐", "铭传", "启超", "公度",
                "维新", "仲淹", "道济", "子敬", "公瑾", "伯约", "文若", "奉孝", "仲谋", "元直",
                "幼安", "士元", "文长", "伯符", "子龙", "翼德", "云长", "孟起", "汉升", "公明",
                "文远", "妙才", "元让", "德谋", "公覆", "兴霸", "仲康", "子义", "伯言", "幼平",
                "轩", "辰", "逸", "宸", "泽", "昊", "煜", "琰", "珏", "澈",
                "渊", "瀚", "朗", "睿", "骁", "翰", "霖", "曦", "熙", "瑜",
                "瑾", "珣", "恪", "恂", "惇", "恺", "靖", "达", "普", "基",
                "珩", "琨", "琮", "璋", "琛", "琦", "璟", "璆", "玙", "瑨",
            ],
            female: [
                "婉清", "令仪", "淑宁", "静姝", "明玥", "昭华", "若蘅", "清和", "思柔", "惠宁",
                "文茵", "令昭", "婉仪", "明珠", "兰芝", "若兰", "嘉禾", "幼微", "道韫", "清照",
                "徽音", "淑真", "清辉", "紫薇", "碧霞", "流云", "映月", "清音", "雅韵", "冰心",
                "念慈", "静雅", "秋水", "明月", "素心", "雪莹", "采薇", "映雪", "锦瑟", "淑慎",
                "惠娴", "瑞芝", "兰芷", "蕙心", "玉瑶", "凝霜", "琼华", "玉容", "舒窈", "知微",
                "婉兮", "清扬", "嘉柔", "令娴", "明慧", "淑仪", "德音", "柔嘉", "端宁", "景仪",
                "昭宁", "永宁", "安平", "长乐", "乐安", "华阳", "清平", "玉润", "冰清", "云舒",
                "云溪", "竹韵", "松雪", "梅影", "荷风", "菊隐", "桂月", "烟霞", "星河", "朝露",
                "暮云", "晴岚", "疏影", "暗香", "凌波", "飞燕", "惊鸿", "青鸾", "丹凤", "灵犀",
                "瑶", "琪", "萱", "柔", "雪", "霜", "月", "云", "兰", "梅",
                "竹", "菊", "莲", "荷", "燕", "凤", "嫣", "婷", "玲", "珠",
                "环", "钰", "瑾", "璇", "媛", "蕊", "霞", "露", "翠", "素",
                "芷", "若", "薇", "芸", "茜", "菱", "盈", "绾", "姝", "妍",
            ],
            houses: [
                "李", "赵", "陈", "王", "刘", "杨", "朱", "萧", "谢", "顾",
                "陆", "沈", "周", "杜", "韩", "梁", "钱", "孙", "吴", "郑",
                "冯", "褚", "卫", "蒋", "秦", "许", "何", "吕", "施", "张",
                "孔", "曹", "严", "华", "金", "魏", "陶", "姜", "戚", "邹",
                "窦", "章", "苏", "潘", "葛", "范", "彭", "鲁", "韦", "马",
                "方", "俞", "任", "袁", "柳", "史", "唐", "薛", "雷", "贺",
                "汤", "殷", "罗", "郝", "常", "于", "傅", "齐", "康", "孟",
                "黄", "穆", "尹", "姚", "邵", "汪", "狄", "戴", "宋", "庞",
                "纪", "屈", "项", "祝", "董", "阮", "蓝", "闵", "贾", "江",
                "颜", "郭", "林", "钟", "徐", "邱", "高", "夏", "蔡", "田",
                "樊", "胡", "霍", "虞", "卢", "莫", "房", "应", "宗", "丁",
                "邓", "洪", "左", "石", "崔", "程", "裴", "荀", "武", "叶",
                "白", "温", "柴", "季", "宁", "廖", "熊", "段", "谭", "毛",
                "龚", "侯", "龙", "万", "易", "乔", "赖", "安", "倪", "连",
                "辛", "詹", "耿", "曲", "舒", "梅", "盛", "童", "祝融", "席",
                "司马", "上官", "欧阳", "夏侯", "诸葛", "东方", "皇甫", "尉迟", "公孙", "慕容",
                "独孤", "宇文", "长孙", "轩辕", "令狐", "南宫", "司徒", "西门", "拓跋", "呼延",
                "端木", "澹台", "宗政", "濮阳", "淳于", "单于", "太叔", "申屠", "公冶", "百里",
            ]
        ),
        "japanese": CulturePeople(
            male: [
                "晴信", "义清", "宗明", "景春", "康成", "光彦", "正行", "秀久", "信之", "庆亲",
                "忠义", "明仁", "义经", "赖朝", "义家", "忠胜", "信玄", "谦信", "政宗", "元就",
                "义弘", "家光", "秀忠", "纲吉", "信长", "秀吉", "家康", "光秀", "胜家", "利家",
                "长政", "幸村", "昌幸", "兼续", "景胜", "氏康", "义元", "义昭", "晴久", "经久",
                "隆景", "元春", "辉元", "直政", "忠次", "康政", "清正", "正则", "孝高", "三成",
                "吉继", "行长", "秀家", "秀秋", "宗茂", "宗麟", "隆信", "直茂", "义久", "岁久",
                "家久", "元亲", "盛亲", "尊氏", "直义", "义满", "义政", "正成", "义贞", "显家",
                "胜赖", "久秀", "氏政", "氏直", "义辉", "义荣", "忠兴", "高虎", "正信", "重秀",
            ],
            female: [
                "春子", "明子", "和子", "清子", "幸子", "光子", "千代", "绫", "葵", "雪",
                "初音", "静", "秀子", "芳子", "宫子", "彰子", "定子", "道子", "伦子", "德子",
                "珠", "茶茶", "宁宁", "江", "市", "浓", "松", "菊", "驹", "初",
                "梅", "竹", "鹤", "藤", "樱", "椿", "枫", "百合", "萩", "桐",
                "铃", "琴", "雏", "直虎", "訚千代", "小松", "甲斐", "阿国", "巴", "菖蒲",
            ],
            houses: [
                "藤原", "源", "平", "橘", "足利", "德川", "织田", "上杉", "武田", "伊达",
                "岛津", "毛利", "北条", "浅井", "细川", "今川", "长宗我部", "真田", "本多", "井伊",
                "酒井", "大友", "龙造寺", "锅岛", "松平", "立花", "黑田", "加藤", "福岛", "前田",
                "宇喜多", "羽柴", "丰臣", "明智", "柴田", "丹羽", "泷川", "池田", "森", "蒲生",
                "斋藤", "朝仓", "三好", "松永", "筒井", "六角", "京极", "赤松", "山名", "一色",
                "斯波", "大内", "尼子", "吉川", "小早川", "有马", "相良", "伊东", "秋月", "蜂须贺",
                "山内", "藤堂", "片桐", "石田", "大谷", "小西", "直江", "最上", "南部", "津轻",
                "佐竹", "结城", "里见", "宇都宫",
            ]
        ),
        "korean": CulturePeople(
            male: [
                "成桂", "芳远", "祹", "珦", "瑈", "隆", "怿", "珲", "昀", "昇",
                "熙", "温祚", "朱蒙", "长寿", "文咨", "阶伯", "庾信", "春秋", "弓裔", "甄萱",
                "道传", "舜臣", "成龙", "滉", "珥", "若镛", "正浩", "浚", "梦周", "邯赞",
                "莹", "栗", "齐贤", "穑", "承休", "仁任", "宝", "忠宣", "元晓", "文德",
                "盖苏文", "知讷", "光海", "仁祖", "孝宗", "正祖", "英祖", "肃宗", "世祖", "定宗",
            ],
            female: [
                "淑", "贞", "明", "惠", "顺", "英", "善", "美", "恩", "秀",
                "珍", "玉", "兰", "慧", "敏", "贤", "姬", "媛", "妍", "春香",
                "善德", "真德", "柳花", "召西奴", "平冈", "善花", "真伊", "兰雪", "师任", "贞熹",
                "昭宪", "仁粹", "文定", "惠庆", "贞纯", "纯元", "神德", "元敬", "贞显", "仁穆",
                "庄烈", "仁显", "明成", "端敬", "章敬",
            ],
            houses: [
                "金", "李", "朴", "崔", "郑", "姜", "赵", "尹", "张", "林",
                "韩", "申", "吴", "徐", "权", "黄", "宋", "安", "柳", "洪",
                "全", "高", "文", "孙", "裴", "卢", "河", "郭", "成", "车",
                "朱", "禹", "具", "罗", "许", "南", "沈", "曹", "任", "白",
            ]
        ),
        "vietnamese": CulturePeople(
            male: [
                "部领", "桓", "公蕴", "佛玛", "日尊", "乾德", "煚", "晃", "昑", "烇",
                "利", "思诚", "灏", "登庸", "潢", "福映", "惠", "岳", "廌", "兴道",
                "五老", "权", "常杰", "文休", "秉谦", "检", "松", "攸", "贵惇", "文超",
                "佩珠", "知方", "长祚", "耀", "文祥", "日燏", "光启", "汝谐", "列", "英武",
                "有整", "性", "时任", "光缵", "福晈", "福时", "福膺", "廷沼", "廷琥", "国峻",
            ],
            female: [
                "侧", "贰", "贞", "倚兰", "仪", "安姿", "玉欣", "明开", "春", "春香",
                "点", "定", "玉竹", "金莲", "玉兰", "芳娥", "琼花", "秋香", "兰英", "翠蛾",
                "碧竹", "红绒", "白雪", "春兰", "梅芳", "月娥", "锦云", "琼瑶", "翠翘", "翠云",
                "玉华", "雪梅", "清水", "海棠", "映月", "芝兰", "美玉", "香江", "丽姬", "玉韵",
            ],
            houses: [
                "阮", "陈", "黎", "李", "范", "黄", "潘", "武", "丁", "吴",
                "杜", "裴", "郑", "胡", "邓", "段", "何", "高", "刘", "莫",
                "吕", "徐", "朱", "梅", "谭", "蔡", "柳", "甘", "童", "宋",
            ]
        ),
        "english": CulturePeople(
            male: [
                "埃德蒙", "爱德华", "亨利", "理查", "威廉", "亚瑟", "阿尔弗雷德", "埃德加", "哈罗德", "奥斯瓦尔德",
                "杰弗里", "罗伯特", "约翰", "托马斯", "沃尔特", "罗杰", "斯蒂芬", "休", "拉尔夫", "西蒙",
                "尼古拉斯", "迈克尔", "艾伦", "劳伦斯", "安德鲁", "本杰明", "克里斯托弗", "大卫", "乔治", "詹姆斯",
                "马修", "彼得", "塞缪尔", "丹尼尔", "弗朗西斯", "吉尔伯特", "汉弗莱", "伊萨克", "约瑟夫", "兰斯洛特",
                "奥斯汀", "珀西瓦尔", "鲁珀特", "西奥博尔德", "温斯顿", "埃德温", "雷金纳德", "伯特伦", "克莱门特", "戈弗雷",
                "奥利弗", "埃格伯特", "阿瑟尔斯坦", "塞德里克", "奈杰尔", "霍雷肖", "贾斯珀", "昆廷", "罗兰", "威尔弗雷德",
            ],
            female: [
                "埃莉诺", "玛蒂尔达", "玛格丽特", "伊丽莎白", "玛丽", "安妮", "爱丽丝", "伊迪丝", "凯瑟琳", "伊莎贝尔",
                "琼", "艾格尼丝", "塞西莉", "多萝西", "简", "菲利帕", "比阿特丽斯", "朱莉安娜", "露西", "艾玛",
                "罗斯", "康斯坦丝", "莫德", "海伦", "艾米莉", "夏洛特", "萨拉", "苏珊", "朱迪丝", "罗莎蒙德",
                "格温多琳", "伊莎贝拉", "埃塞尔弗莱德", "弗朗西丝", "格蕾丝", "汉娜", "艾达", "莉莲", "玛乔丽", "奥利维亚",
                "佩内洛普", "罗莎琳德", "维多利亚", "温妮弗雷德", "阿德莱德", "卡罗琳", "黛安娜", "艾琳", "罗温娜",
            ],
            houses: [
                "阿什福德", "哈特韦尔", "韦斯特布鲁克", "伍德福德", "雷文肖", "奥尔德米尔", "惠特莫尔", "费尔法克斯",
                "雷德福德", "温切斯特", "博蒙特", "斯坦利", "珀西", "内维尔", "霍华德", "塔尔博特",
                "莫蒂默", "菲茨杰拉德", "德维尔", "斯塔福德", "赫伯特", "格雷", "克利福德", "斯宾塞",
                "都铎", "斯图亚特", "约克", "兰开斯特", "金雀花", "诺曼", "威塞克斯", "温莎",
                "西摩", "博福特", "德拉波尔", "考特尼", "达德利", "塞西尔", "丘吉尔", "卡文迪什",
                "拉塞尔", "博林", "克伦威尔", "沃伦", "蒙哥马利",
            ]
        ),
        "french": CulturePeople(
            male: [
                "路易", "菲利普", "查理", "亨利", "让", "皮埃尔", "于格", "拉乌尔", "艾蒂安", "加斯东",
                "若弗鲁瓦", "纪尧姆", "弗朗索瓦", "安托万", "雅克", "尼古拉", "贝尔纳", "罗兰", "奥利维耶", "阿兰",
                "泰奥多尔", "阿尔芒", "勒内", "热拉尔", "克洛维", "丕平", "卡洛曼", "罗贝尔", "雨果", "奥多",
                "鲍德温", "戈德弗鲁瓦", "雷蒙", "博埃蒙", "坦克雷德", "蒂埃里", "埃德蒙", "阿方斯", "樊尚", "朱利安",
                "马蒂厄", "巴蒂斯特", "塞巴斯蒂安", "克莱芒", "阿德里安", "达米安", "洛朗", "帕斯卡尔", "西尔万", "蒂博",
                "于尔班", "瓦朗坦", "伊夫", "阿梅代", "布鲁诺", "德尼", "费利克斯", "吉勒", "朱尔", "奥古斯坦",
            ],
            female: [
                "让娜", "伊莎贝尔", "玛格丽特", "布朗什", "阿黛尔", "玛丽", "路易丝", "阿莉埃诺", "卡特琳", "夏洛特",
                "阿涅丝", "埃莱娜", "克莱尔", "玛蒂尔德", "加布里埃尔", "朱丽叶", "索菲", "塞西尔", "弗朗索瓦丝", "玛德莱娜",
                "埃米莉", "洛朗丝", "妮科尔", "西蒙娜", "凯瑟琳", "贝尔特", "克洛蒂尔德", "布伦希尔德", "安妮", "克劳德",
                "黛安娜", "玛丽安娜", "苏珊娜", "奥德", "艾玛", "朱莉", "伊冯娜", "若塞芬", "维尔日妮", "罗萨莉",
                "奥尔唐斯", "德尔菲娜", "热纳维耶芙", "塞莉娜", "科拉莉", "埃丝特", "弗洛朗斯", "莱奥妮", "贞德",
            ],
            houses: [
                "克莱尔蒙", "罗什福尔", "贝拉克", "博蒙", "瓦尔蒙", "蒙特勒伊", "谢纳", "丰特奈",
                "欧布瓦", "圣克莱尔", "维利耶", "拉罗什", "杜瓦尔", "德拉图尔", "沙蒂永", "拉瓦尔",
                "罗昂", "蒙莫朗西", "吕西尼昂", "库西", "诺阿耶", "格拉蒙", "罗什舒阿尔", "卡佩",
                "瓦卢瓦", "波旁", "奥尔良", "安茹", "勃艮第", "阿基坦", "布列塔尼", "香槟",
                "布卢瓦", "图卢兹", "吉斯", "拉罗什富科", "黎塞留", "蒂雷纳", "孔代", "洛林",
                "萨伏依", "普罗旺斯", "诺曼底", "佛兰德", "纳瓦拉", "富瓦", "阿马尼亚克", "拉法耶特", "科尔贝", "马扎然",
            ]
        ),
        "german": CulturePeople(
            male: [
                "海因里希", "弗里德里希", "奥托", "康拉德", "路德维希", "阿尔布雷希特", "卡尔", "鲁道夫", "威廉", "迪特里希",
                "赫尔曼", "乌尔里希", "伯恩哈德", "沃尔夫冈", "西格弗里德", "埃伯哈德", "格奥尔格", "约翰", "赫尔穆特", "马丁",
                "汉斯", "恩斯特", "古斯塔夫", "腓特烈", "马克西米利安", "西吉斯蒙德", "鲁普雷希特", "洛泰尔", "布鲁诺", "格哈德",
                "哈特曼", "霍斯特", "约阿希姆", "克劳斯", "洛塔尔", "曼弗雷德", "诺伯特", "奥斯卡", "保罗", "拉尔夫",
                "西格蒙德", "特奥多尔", "维尔纳", "沃尔夫拉姆", "阿诺德", "贝特霍尔德", "埃克哈特", "费迪南德", "戈特弗里德", "哈拉尔德",
                "伊格纳茨", "卡斯帕尔", "利奥波德", "莫里茨", "尼古劳斯", "奥斯瓦尔德", "斐迪南",
            ],
            female: [
                "阿德尔海德", "玛蒂尔德", "黑德维希", "格特鲁德", "希尔德加德", "伊丽莎白", "阿格尼斯", "库尼贡德", "伊尔姆加德", "索菲",
                "贝尔塔", "乌塔", "玛丽亚", "安娜", "多萝特娅", "玛格达莱娜", "芭芭拉", "卡塔琳娜", "约翰娜", "弗里德里克",
                "威廉明娜", "奥蒂莉", "克拉拉", "露易丝", "玛格丽特", "梅希蒂尔德", "克里斯蒂娜", "埃尔泽", "弗丽达", "格蕾塔",
                "汉娜", "伊达", "卡罗琳", "罗莎", "西比尔", "特蕾莎", "阿玛利娅", "贝雅特丽克丝", "康斯坦策", "艾米莉亚",
                "弗兰齐斯卡", "海伦妮", "伊莎贝拉", "莱奥诺蕾", "玛琳", "娜塔莉", "奥古斯塔", "宝琳娜", "维罗妮卡", "克里姆希尔德",
            ],
            houses: [
                "法尔肯贝格", "罗森海姆", "艾兴瓦尔德", "施泰因巴赫", "霍恩费尔斯", "比尔克瑙", "拉本施泰因", "沃尔夫斯堡",
                "艾森贝格", "西尔伯霍夫", "阿德勒费尔德", "希尔施贝格", "霍亨索伦", "哈布斯堡", "维特尔斯巴赫", "韦廷",
                "阿斯坎尼", "韦尔夫", "霍亨斯陶芬", "卢森堡", "拿骚", "奥尔登堡", "巴登", "黑森",
                "萨利安", "符腾堡", "梅克伦堡", "普法尔茨", "勃兰登堡", "萨克森", "巴伐利亚", "施瓦本",
                "弗兰肯", "图林根", "安哈尔特", "利珀", "罗伊斯", "施瓦茨堡", "霍恩洛厄", "莱宁根",
                "富格尔", "韦尔泽", "俾斯麦", "毛奇", "瓦伦斯坦", "布吕歇尔", "格奈森瑙",
            ]
        ),
        "roman": CulturePeople(
            male: [
                "马库斯", "盖乌斯", "卢基乌斯", "提图斯", "普布利乌斯", "昆图斯", "奥卢斯", "德基穆斯", "提比略", "塞克斯图斯",
                "格奈乌斯", "塞尔维乌斯", "阿庇乌斯", "马尼乌斯", "斯普里乌斯", "图卢斯", "努梅里乌斯", "维比乌斯", "卡埃索", "福斯图斯",
                "阿格里帕", "保卢斯", "加莱里乌斯", "奥古斯都", "布鲁图斯", "西塞罗", "加图", "庞培", "克拉苏", "苏拉",
                "马略", "西庇阿", "格拉古", "卡米卢斯", "辛辛纳图斯", "马塞卢斯", "维斯帕先", "图密善", "涅尔瓦", "图拉真",
                "哈德良", "安敦宁", "康茂德", "塞维鲁", "卡拉卡拉", "戴克里先", "君士坦丁", "狄奥多西", "瓦伦提尼安", "埃提乌斯",
                "贝利萨留", "斯提里科", "阿格里科拉", "德鲁苏斯", "塞涅卡", "恺撒", "查士丁尼",
            ],
            female: [
                "普莉玛", "塞昆达", "特尔提娅", "夸尔塔", "昆塔", "塞克斯塔", "塞普提玛", "诺娜", "德基玛", "马克西玛",
                "米诺尔", "利维娅", "奥克塔维娅", "阿格里庇娜", "梅萨利娜", "波佩娅", "福尔维娅", "塞尔维利娅", "卢克蕾提娅", "维吉尼娅",
                "普拉蒂娜", "萨比娜", "福斯蒂娜", "多姆娜", "梅萨", "马米娅", "海伦娜", "普拉西迪娅", "塔齐娅", "维比娅",
                "卢西拉", "庞波尼娅", "阿提娅", "伊格纳提娅", "马尔切拉", "西尔维娅", "奥塔基利娅", "普罗库拉",
            ],
            houses: [
                "尤利乌斯", "克劳狄乌斯", "科尔内利乌斯", "艾米利乌斯", "瓦莱里乌斯", "法比乌斯", "弗拉维乌斯", "奥勒利乌斯",
                "卡西乌斯", "图利乌斯", "安东尼乌斯", "卡尔普尔尼乌斯", "埃利乌斯", "乌尔皮乌斯", "塞普提米乌斯", "利基尼乌斯",
                "苏尔皮基乌斯", "塞姆普罗尼乌斯", "多米提乌斯", "马尔基乌斯", "尤尼乌斯", "昆克提乌斯", "庞培乌斯", "李维乌斯",
                "波尔基乌斯", "霍滕西乌斯", "卢塔提乌斯", "帕皮里乌斯", "曼利乌斯", "波斯图米乌斯",
            ]
        ),
        "arab": CulturePeople(
            male: [
                "哈桑", "侯赛因", "欧麦尔", "阿里", "哈立德", "优素福", "萨利姆", "塔里克", "希沙姆", "纳比勒",
                "宰德", "法里斯", "艾哈迈德", "穆罕默德", "阿卜杜拉", "易卜拉欣", "伊斯梅尔", "奥斯曼", "赛义德", "马哈茂德",
                "拉希德", "曼苏尔", "瓦利德", "苏莱曼", "叶齐德", "穆阿维叶", "马尔万", "哈伦", "马蒙", "穆阿台绥姆",
                "马赫迪", "萨拉丁", "努尔丁", "拜巴尔斯", "盖拉温", "贾法尔", "穆萨", "伊德里斯", "胡奈因", "贾比尔",
                "阿巴斯", "哈姆扎", "祖拜尔", "塔勒哈", "赛阿德", "阿姆尔", "哈里斯", "苏海勒", "萨利赫", "纳斯尔",
                "穆斯塔法", "卡西姆", "海赛姆", "纳迪姆", "马利克", "扎希尔", "阿明", "乌萨马",
            ],
            female: [
                "阿伊莎", "法蒂玛", "赫蒂彻", "麦尔彦", "宰娜卜", "莱拉", "萨尔玛", "欣德", "努拉", "阿米拉",
                "拉尼娅", "萨菲娅", "哈菲萨", "鲁盖娅", "阿斯玛", "苏迈娅", "哈丽玛", "纳迪娅", "贾米拉", "法里达",
                "卡里玛", "巴斯玛", "萨米拉", "丽姆", "海芙赛", "拉比娅", "祖蓓达", "哈伊祖兰", "玛丽亚姆", "哈娜",
                "努尔", "阿米娜", "雅斯敏", "达莉娅", "海法", "拉蒂法", "穆尼拉", "迪娜", "法拉", "卢布娜",
                "努哈", "拉沙", "萨芭", "沙贾拉",
            ],
            houses: [
                "萨利姆", "宰德", "哈希姆", "阿萨德", "泰米姆", "哈立德", "希拉勒", "阿米尔", "巴克尔", "苏莱姆",
                "哈尼法", "凯勒卜", "古莱什", "金达", "盖斯", "泰伊", "艾兹德", "胡宰勒", "朱海纳", "塔格利卜",
                "阿卜斯", "祖赫拉", "倭马亚", "阿拔斯", "法蒂玛", "阿尤布", "马木留克", "基拉布", "萨基夫", "马赫祖姆",
                "拉赫姆", "加萨尼", "哈姆丹", "阿格拉布", "伊德里斯", "图伦", "伊赫希德", "穆拉比特", "穆瓦希德", "纳斯尔",
                "宰亚尼", "马林", "哈夫斯", "萨阿德",
            ]
        ),
        "greek": CulturePeople(
            male: [
                "亚历山德罗斯", "尼古拉奥斯", "季米特里奥斯", "列奥尼达斯", "狄奥多罗斯", "阿里斯提翁", "克勒翁", "吕山德罗斯", "腓力普斯", "达蒙",
                "尼科斯", "索蒂里奥斯", "阿里斯托特勒斯", "阿尔基比亚德斯", "德摩斯梯尼", "伯里克利", "色诺芬", "索福克勒斯", "欧里庇得斯", "米尔提亚德斯",
                "帖米斯托克勒斯", "阿里斯提德斯", "克利斯提尼", "欧克里德斯", "西蒙", "修昔底德", "希罗多德", "柏拉图", "苏格拉底", "毕达哥拉斯",
                "阿基米德", "希波克拉底", "埃斯库罗斯", "阿里斯托芬", "伊巴密浓达", "佩洛皮达斯", "阿格西劳斯", "来库古", "梭伦", "庇西特拉图",
                "狄奥尼修斯", "皮洛士", "安提柯", "塞琉古", "托勒密", "卡山德", "利西马科斯", "德米特里", "安条克", "阿塔罗斯",
                "欧迈尼斯", "菲洛波门", "阿拉托斯", "克里昂米尼", "阿基斯",
            ],
            female: [
                "海伦娜", "索菲亚", "狄奥多拉", "克利俄", "达芙妮", "伊琳娜", "卡利斯塔", "亚历山德拉", "克塞尼娅", "塔利娅",
                "阿里阿德涅", "欧多基娅", "佩涅洛佩", "安提戈涅", "伊菲革涅亚", "厄勒克特拉", "阿斯帕西娅", "奥林匹娅斯", "贝勒尼基", "克娄巴特拉",
                "阿尔西诺伊", "劳狄刻", "欧律狄刻", "墨利萨", "萨福", "斯特拉托尼丝", "菲莉亚", "塞萨洛尼丝", "海伦", "安德洛玛刻",
                "卡珊德拉", "伊斯墨涅", "美狄亚", "淮德拉", "狄俄提玛", "希帕提娅", "阿加莎", "佐伊", "安娜", "欧多西娅",
                "阿尔忒弥西亚", "克吕泰涅斯特拉", "达娜厄", "欧罗巴", "伽拉忒亚", "普绪刻", "塞墨勒", "忒提斯",
            ],
            houses: [
                "尼古拉伊德斯", "莱昂提德斯", "多里亚德斯", "阿里斯提德斯", "狄奥多里德斯", "腓力庇德斯", "德米特里亚德斯", "克莱奥尼德斯",
                "吕山德里德斯", "赫利亚迪斯", "索蒂里迪斯", "卡利德斯", "阿尔克迈翁", "阿吉亚德", "欧里庞提德", "阿吉德",
                "埃阿基德", "安提柯", "塞琉古", "拉吉德", "阿塔利德", "安提帕特", "巴基亚德", "库普塞洛斯",
                "托勒密", "阿塔罗斯", "佩西斯特拉提德", "科德里德", "墨兰提德", "内勒伊德", "佩洛皮德", "阿特柔斯",
                "科穆宁", "杜卡斯", "帕里奥洛格", "安格洛斯", "拉斯卡里斯", "坎塔库泽努斯", "福卡斯", "斯克莱罗斯",
                "伊苏里亚", "阿莫里亚", "赫拉克利德",
            ]
        ),
        "persian": CulturePeople(
            male: [
                "阿尔达希尔", "巴赫拉姆", "大流士", "居鲁士", "库思老", "法尔哈德", "鲁斯塔姆", "米赫尔达德", "沙普尔", "纳迪尔",
                "阿尔曼", "苏鲁什", "阿尔塔薛西斯", "冈比西斯", "薛西斯", "卑路斯", "卡瓦德", "霍尔米兹德", "亚兹德格尔德", "巴巴克",
                "萨曼", "伊斯梅尔", "阿拔斯", "胡马雍", "阿契美尼斯", "泰斯佩斯", "巴尔迪亚", "阿尔塔班", "密特拉达梯", "弗拉特斯",
                "奥罗德斯", "苏雷纳", "阿尔达旺", "伏洛吉斯", "纳塞赫", "霍尔木兹", "瓦赫兰", "贾马斯普", "沙赫巴拉兹", "马赫穆德",
                "桑贾尔", "贾拉勒丁", "塔赫玛斯普", "萨菲", "卡里姆", "法塔赫", "纳赛尔丁", "菲尔多西", "鲁米", "贾姆希德", "法里东",
            ],
            female: [
                "阿托莎", "希琳", "罗克珊娜", "阿扎德", "达里娅", "米特拉", "帕里莎", "阿娜希塔", "普兰", "鲁达贝",
                "戈尔达法里德", "西敏", "斯塔提拉", "帕丽萨蒂斯", "曼达娜", "阿尔泰涅", "阿尔塔斯通", "艾米提斯", "罗多古娜", "巴努",
                "芙鲁赞", "娜希德", "玛赫萨", "萨哈", "巴兰", "阿扎尔米杜赫特", "古尔纳尔", "塔赫米娜", "法兰吉丝", "帕丽",
                "纳斯琳", "蒂娜", "玛赫", "莎赫拉扎德", "努尔贾汉", "蒙塔兹", "帕尔瓦内", "索拉娅", "法拉赫", "戈尔诺什", "扎丽娜",
            ],
            houses: [
                "梅赫拉比", "法拉哈尼", "设拉子", "大不里士", "伊斯法哈尼", "马赞达拉尼", "克尔马尼", "拉齐",
                "巴赫拉米", "阿扎里", "达里亚尼", "鲁斯塔米", "萨珊", "阿契美尼德", "阿尔萨息", "卡伦",
                "苏伦", "米赫兰", "斯潘迪亚德", "伊斯帕布丹", "齐赫", "萨法维", "阿夫沙尔", "赞德",
                "帕提亚", "萨曼", "布韦", "伽色尼", "塞尔柱", "花剌子模", "帖木儿", "卡扎尔",
                "塔希尔", "萨法尔", "齐亚尔", "卡库伊", "穆扎法尔", "法尔斯", "锡斯坦", "吉兰",
            ]
        ),
        "slavic": CulturePeople(
            male: [
                "弗拉基米尔", "雅罗斯拉夫", "米罗斯拉夫", "斯维亚托斯拉夫", "弗谢沃洛德", "鲍里斯", "伊戈尔", "伊凡", "德米特里", "米兰",
                "拉多万", "德拉戈米尔", "奥列格", "留里克", "姆斯季斯拉夫", "罗斯季斯拉夫", "弗拉季斯拉夫", "波列斯瓦夫", "卡齐米日", "瓦茨拉夫",
                "普热米斯尔", "彼得", "斯捷潘", "尼古拉", "雅罗波尔克", "伊兹雅斯拉夫", "维亚切斯拉夫", "尤里", "安德烈", "亚历山大",
                "丹尼尔", "西蒙", "谢苗", "瓦西里", "费奥多尔", "米哈伊尔", "格列布", "罗曼", "奥塔卡尔", "博列斯拉夫",
                "梅什科", "瓦迪斯瓦夫", "齐莫维特", "亨里克", "斯特凡", "拉迪斯拉夫", "杜尚", "拉扎尔", "武克", "米洛什",
                "佩塔尔", "托米斯拉夫", "克雷希米尔", "兹沃尼米尔", "萨穆埃尔", "西美昂", "阿森", "卡洛扬", "阿列克谢", "康斯坦丁",
            ],
            female: [
                "奥尔加", "安娜", "米莱娜", "薇拉", "柳德米拉", "兹拉塔", "米罗斯拉娃", "拉多斯拉娃", "达里娅", "娜杰日达",
                "叶莲娜", "斯韦特兰娜", "叶卡捷琳娜", "塔季扬娜", "玛丽娅", "伊琳娜", "娜塔莉娅", "叶芙多基娅", "索菲娅", "阿纳斯塔西娅",
                "博古米拉", "德拉加", "丹妮察", "佐娅", "叶夫普拉克西娅", "罗格涅达", "马琳娜", "克塞尼娅", "斯拉夫娜", "米拉",
                "博扎娜", "德拉加娜", "雅德维加", "杜布拉夫卡", "丽布舍", "阿涅日卡", "丝维塔", "兹登卡", "佐丽卡", "阿林娜",
                "叶夫根尼娅", "加琳娜", "卡琳娜", "拉里莎", "尼娜", "波琳娜", "拉伊莎", "塔玛拉", "乌里扬娜", "瓦伦蒂娜", "雅罗斯拉娃", "玛尔法",
            ],
            houses: [
                "沃尔科夫", "奥尔洛夫", "索科洛夫", "莫罗佐夫", "诺瓦克", "科瓦尔斯基", "扬科维奇", "彼得罗维奇",
                "伊万诺夫", "韦塞林", "拉多维奇", "别洛夫", "罗曼诺夫", "戈东诺夫", "舒伊斯基", "奥博连斯基",
                "戈利岑", "多尔戈鲁科夫", "特鲁别茨科伊", "波托茨基", "扎莫伊斯基", "日夫科维奇", "卡拉乔尔杰维奇", "拉扎列维奇",
                "留里克", "格林斯基", "沃龙佐夫", "舍列梅捷夫", "普热米斯尔", "皮亚斯特", "雅盖隆", "拉齐维乌",
                "恰尔托雷斯基", "萨佩哈", "尼曼雅", "布兰科维奇", "科特罗马尼奇", "阿森", "希什曼", "库图佐夫", "苏沃洛夫", "波将金",
            ]
        ),
        "norse": CulturePeople(
            male: [
                "埃里克", "哈拉尔", "奥拉夫", "斯文", "比约恩", "伊瓦尔", "哈康", "西居尔", "莱夫", "贡纳尔",
                "哈夫丹", "马格努斯", "克努特", "瓦尔德马", "拉格纳", "罗尔夫", "托尔斯坦", "阿尔内", "埃纳尔", "埃吉尔",
                "斯图尔拉", "奥德", "菲恩", "斯韦雷", "乌比", "西格德", "斯韦恩", "英吉", "埃斯泰因", "比格尔",
                "罗洛", "古斯拉姆", "托斯蒂格", "乌尔夫", "哥德弗雷德", "赫明", "霍里克", "奥塔尔", "斯诺里", "英格瓦",
                "格里姆", "赫罗尔夫", "斯泰因", "托尔芬", "卡尔", "古斯塔夫", "霍康", "海斯坦",
            ],
            female: [
                "阿斯特丽德", "英格丽德", "西格丽德", "蒂拉", "弗蕾迪丝", "古德伦", "拉格希尔德", "希尔达", "赫尔加", "西涅",
                "埃拉", "索尔薇格", "英格堡", "卡琳", "克里斯蒂娜", "玛格丽特", "布伦希尔德", "托拉", "阿萨", "奥德",
                "博蒂尔", "乌尔菲尔德", "埃斯特里德", "拉格妮尔", "贡希尔德", "阿斯劳格", "拉格莎", "西格妮", "瓦尔布格", "斯瓦娃",
                "希尔德", "赫尔德", "弗丽格", "伊杜娜", "斯卡蒂", "弗蕾娅", "朗希尔德", "西格伦", "达格妮", "古娜",
                "英格", "约伦", "卡里", "莉芙", "马格希尔德",
            ],
            houses: [
                "赫拉夫松", "比约恩松", "埃里克松", "奥拉夫松", "哈拉尔松", "西居尔松", "贡纳尔松", "伊瓦尔松",
                "莱夫松", "马格努松", "斯文松", "哈康松", "埃纳尔松", "埃吉尔松", "阿尔内松", "奥德松",
                "芬松", "斯图尔松", "托尔松", "拉格纳松", "罗尔夫松", "奥斯蒙松", "哈夫丹松", "克努特松",
                "英格林", "耶灵", "埃斯特里德森", "斯韦雷", "福尔孔", "斯滕基尔", "斯维克", "博恩德",
                "古德蒙松", "斯诺里松", "格里姆松", "乌尔夫松", "罗格瓦尔松", "奥克尼", "默勒", "拉德",
            ]
        ),
        "indian": CulturePeople(
            male: [
                "阿周那", "毗讫罗摩", "阿难陀", "提婆因陀罗", "旃陀罗", "苏伦陀罗", "拉真陀罗", "戒日", "摩达婆", "罗毗",
                "阿迭多", "戈文德", "阿育", "萨姆陀罗", "库玛罗", "斯建陀", "拉摩", "克里希那", "那罗延", "婆斯卡罗",
                "阇耶辛哈", "纳拉辛哈", "普里特维", "宾头娑罗", "普拉凯辛", "罗阇罗阇", "希瓦吉", "巴吉拉奥", "德瓦罗耶", "迦梨陀娑",
                "阿耶波多", "婆罗摩笈多", "摩奴", "迦腻色伽", "弥兰陀", "难陀", "普什亚米特拉", "阿格尼米特拉", "沙塔卡尼", "悉达多",
                "般度", "坚战", "怖军", "阿克巴", "贾汉吉尔", "奥朗则布", "桑伽", "普拉塔普",
            ],
            female: [
                "波德摩", "吉祥天", "提毗", "因迪拉", "安贾丽", "米拉", "多罗", "迦摩罗", "高丽", "南迪妮",
                "珊蒂", "乌莎", "杜尔迦", "娑罗室伐底", "萨维特丽", "悉多", "卢克米妮", "罗陀", "亚肖达", "阿姆丽塔",
                "伽耶特丽", "玛拉蒂", "苏妮塔", "乌尔米拉", "德罗波蒂", "贡蒂", "甘陀利", "莎恭达罗", "达摩衍蒂", "帕德米妮",
                "拉克希米", "帕尔瓦蒂", "卡莉", "乌玛", "萨蒂", "阿妮塔", "普丽娅", "卡维塔", "苏米特拉", "曼达维",
                "拉齐娅", "努尔贾汉", "杰哈纳拉", "阿希利亚",
            ],
            houses: [
                "笈多", "乔汉", "拉托尔", "遮娄其", "帕拉瓦", "朱罗", "潘地亚", "罗湿陀罗拘陀",
                "塞纳", "帕拉玛拉", "索兰基", "托马拉", "孔雀", "迦提耶", "波罗", "普拉蒂哈拉",
                "伽诃达瓦拉", "霍伊萨拉", "卡达姆巴", "耶达婆", "卡拉丘里", "夏希", "跋摩", "贵霜",
                "萨塔瓦哈纳", "瓦尔达纳", "甘加", "昌德拉", "瓦格拉", "希索迪亚", "卡奇瓦哈", "马拉塔",
                "毗奢耶那伽罗", "巴赫曼尼",
            ]
        ),
        "mongol": CulturePeople(
            male: [
                "铁木真", "拖雷", "窝阔台", "察合台", "术赤", "忽必烈", "蒙哥", "旭烈兀", "拔都", "贵由",
                "也速该", "木华黎", "博尔术", "者勒蔑", "速不台", "哲别", "阿里不哥", "海都", "合撒儿", "别勒古台",
                "巴图", "苏赫", "乌恩", "格日勒", "孛端察儿", "合不勒", "俺巴孩", "忽图剌", "蒙力克", "赤老温",
                "纳牙阿", "豁儿赤", "失吉忽秃忽", "阔阔出", "札木合", "脱黑脱阿", "阿勒坛", "忽察儿", "答里台", "伯颜",
                "阿术", "铁木迭儿", "燕帖木儿", "脱脱", "也先", "达延", "俺答", "林丹", "噶尔丹", "策妄",
            ],
            female: [
                "诃额仑", "孛儿帖", "唆鲁禾帖尼", "察必", "阿兰", "忽兰", "也遂", "也速干", "乃马真", "斡兀立",
                "琪琪格", "萨仁", "娜仁", "乌兰", "高娃", "托娅", "斯琴", "阿拉坦", "塔娜", "吉雅",
                "苏日娜", "敖敦", "哈斯", "阿阑豁阿", "莫拿伦", "豁阿黑臣", "合答安", "阔阔真", "南必", "满都海",
                "海迷失", "囊囊", "朵儿只", "宝音", "格根", "乌云", "赛罕", "阿茹娜", "图雅", "诺敏",
                "萨日朗", "额尔德尼", "明安", "伊德尔",
            ],
            houses: [
                "孛儿只斤", "乞颜", "札答阑", "泰赤乌", "弘吉剌", "蔑儿乞", "克烈", "乃蛮",
                "塔塔儿", "斡亦剌", "汪古", "兀良哈", "巴阿邻", "别速", "雪你惕", "朵儿边",
                "主儿乞", "兀鲁兀", "忙兀", "阿儿剌", "许兀慎", "伯岳吾", "钦察", "阿速",
                "札剌亦儿", "亦乞列思", "斡勒忽讷", "豁罗剌思", "八邻", "捏古思", "晃豁坛", "别勒古讷",
            ]
        ),
        "turkic": CulturePeople(
            male: [
                "土门", "室点密", "木杆", "佗钵", "阙特勤", "毗伽", "骨咄禄", "默啜", "颉利", "突利",
                "图格里勒", "阿尔斯兰", "马立克", "奥斯曼", "奥尔汗", "穆拉德", "巴耶济德", "梅赫梅特", "苏莱曼", "帖木儿",
                "巴布尔", "伊尔迪兹", "卡迪尔", "萨图克", "伊利", "乙毗", "沙钵略", "处罗", "射匮", "统叶护",
                "步迦", "车鼻", "骨力裴罗", "磨延啜", "牟羽", "顿莫贺", "怀信", "保义", "马哈茂德", "马苏德",
                "桑贾尔", "凯伊库巴德", "塞利姆", "易卜拉欣", "艾哈迈德", "穆斯塔法", "卡普兰", "阿提拉", "阿尔普",
            ],
            female: [
                "阿依古丽", "古丽", "阿伊莎", "图兰", "赛尔达", "居尔", "努尔", "艾谢", "哈蒂杰", "梅尔耶姆",
                "蒂尔坎", "阿尔腾", "苏丹娜", "哈萨", "宝勒", "阿伊", "雅希", "贝拉", "居尔巴哈尔", "纳斯林",
                "阿迪莱", "法蒂玛", "泽伊内普", "婆匐", "伊莉", "达尔布", "玛赫珀", "努尔巴努", "萨菲耶", "柯塞姆",
                "图尔汗", "米赫丽玛", "哈菲莎", "艾斯玛", "埃米内", "古尔南", "宾纳兹", "阿伊塞尔", "厄兹莱姆", "德尼兹",
                "叶希姆", "许蕾姆", "阿伊达", "赛尔玛",
            ],
            houses: [
                "阿史那", "阿史德", "葛逻禄", "回纥", "拔悉密", "薛延陀", "仆固", "同罗",
                "契苾", "乌古斯", "钦察", "塞尔柱", "奥斯曼", "卡拉汗", "哥疾宁", "花剌子模",
                "喀喇", "样磨", "处月", "沙陀", "突骑施", "咽面", "拔野古", "思结",
                "坎德尔", "卡拉曼", "格尔米扬", "萨鲁汉", "艾登", "门特谢", "丹尼什曼", "阿尔图", "伊斯芬迪亚尔",
            ]
        ),
        "egyptian": CulturePeople(
            male: [
                "美尼斯", "左塞尔", "胡夫", "哈夫拉", "孟卡拉", "阿蒙涅姆赫特", "塞索斯特里斯", "雅赫摩斯", "图特摩斯", "阿蒙霍特普",
                "阿肯那顿", "图坦卡蒙", "霍伦海布", "拉美西斯", "塞提", "美楞普塔", "普萨美提克", "尼科", "阿玛西斯", "伊姆霍特普",
                "塞内穆特", "阿伊", "斯门德斯", "舍尚克", "那尔迈", "阿哈", "杰尔", "登", "卡塞凯姆威", "斯尼弗鲁",
                "杰德夫拉", "乌塞尔卡夫", "萨胡拉", "尼乌塞拉", "乌纳斯", "特蒂", "佩皮", "门图霍特普", "卡摩斯", "塞肯内拉",
                "普塔霍特普", "卡格姆尼", "内布卡", "赫里霍尔", "皮安基", "沙巴卡", "塔哈尔卡", "阿普里埃斯",
            ],
            female: [
                "哈特谢普苏特", "纳芙蒂蒂", "奈菲尔塔丽", "提雅", "克娄巴特拉", "阿赫摩斯", "梅丽特", "伊西斯", "奈特", "安凯塞纳蒙",
                "贝蕾妮丝", "阿尔西诺伊", "塔维瑟", "穆特诺芙瑞特", "赫努特森", "奈弗鲁", "索贝克尼弗鲁", "梅丽塔蒙", "伊塞特", "塔胡特",
                "卡鲁玛", "内斯", "拉姆塔", "梅丽特奈特", "赫特菲莉斯", "美瑞桑卡", "肯特卡维斯", "奈特赫特普", "伊普特", "阿赫霍特普",
                "梅丽特拉", "伊西斯诺弗瑞特", "比特安塔", "梅丽塔顿", "塔沃斯塔", "阿蒙尼尔迪斯", "谢普努佩特", "尼托克丽丝", "伊内妮", "赛内特",
                "奈弗瑞特", "塔塞特", "赫努特",
            ],
            houses: [
                "底比斯", "孟斐斯", "赫利奥波利斯", "塞易斯", "塔尼斯", "布巴斯提斯", "阿拜多斯", "阿斯旺",
                "象岛", "卡纳克", "卢克索", "阿玛尔纳", "法尤姆", "西奈", "努比亚", "库施",
                "托勒密", "拉美西斯", "图特摩斯", "阿蒙涅姆赫特", "塞索斯特里斯", "普萨美提克", "舍尚克", "奈克塔内布",
                "阿蒙", "普塔", "托特", "荷鲁斯", "奥西里斯", "阿努比斯", "索贝克", "哈托尔",
            ]
        ),
        "spanish": CulturePeople(
            male: [
                "阿方索", "费尔南多", "桑乔", "佩德罗", "海梅", "恩里克", "胡安", "卡洛斯", "费利佩", "罗德里戈",
                "迭戈", "贡萨洛", "拉米罗", "奥多尼奥", "加西亚", "贝尔穆多", "马丁", "路易斯", "安东尼奥", "弗朗西斯科",
                "伊尼戈", "佩拉约", "阿尔瓦罗", "鲁伊", "雷卡雷德", "莱奥维希尔德", "罗德里克", "阿塔纳吉尔德", "瓦姆巴", "埃尔南",
                "洛佩", "伊格纳西奥", "哈维尔", "曼努埃尔", "塞巴斯蒂昂", "拉斐尔", "米格尔", "加布里埃尔", "埃斯特万", "马特奥",
            ],
            female: [
                "伊莎贝拉", "胡安娜", "乌拉卡", "贝伦格拉", "布兰卡", "玛丽亚", "卡塔利娜", "莱昂诺尔", "康斯坦萨", "特蕾莎",
                "伊内斯", "埃尔维拉", "桑查", "安娜", "露西亚", "玛格丽塔", "贝亚特丽斯", "克拉拉", "弗朗西斯卡", "阿方莎",
                "梅尔塞德斯", "卡门", "多洛雷斯", "皮拉尔", "普拉西迪亚", "戈伊斯文塔", "贝伦加里亚", "埃莉诺", "罗莎莉亚", "罗西奥",
                "阿苏塞纳", "帕洛玛", "格洛丽亚", "埃斯佩兰萨", "雷梅迪奥斯", "苏莱玛", "阿尔穆德纳",
            ],
            houses: [
                "特拉斯塔马拉", "希梅内斯", "阿尔瓦雷斯", "托莱多", "门多萨", "古斯曼", "恩里克斯", "拉腊",
                "阿罗", "庞塞", "苏尼加", "卡斯特罗", "埃雷拉", "瓦尔加斯", "卡德纳斯", "贝拉斯科",
                "波尔哈", "科尔多瓦", "阿库尼亚", "奥索里奥", "皮门特尔", "卢纳", "莫拉", "塞尔达",
                "伊巴拉", "奥尼亚特", "桑多瓦尔", "阿尔布开克", "法哈尔多", "梅洛", "科尔特斯", "皮萨罗", "阿尔瓦",
            ]
        ),
        "italian": CulturePeople(
            male: [
                "洛伦佐", "科西莫", "朱利亚诺", "乔瓦尼", "弗朗切斯科", "彼得罗", "马可", "安东尼奥", "卢多维科", "加莱亚佐",
                "恩里科", "费德里科", "贝尔纳多", "亚历山德罗", "切萨雷", "尼科洛", "保罗", "雅各布", "菲利波", "多梅尼科",
                "乔治", "里纳尔多", "奥塔维奥", "圭多", "狄奥多里克", "贝伦加尔", "阿尔杜因", "罗杰", "坦克雷德", "曼弗雷德",
                "康拉丁", "埃泽利诺", "坎格兰德", "马泰奥", "阿佐", "博尼法齐奥", "卢卡", "但丁", "列奥纳多", "米开朗基罗",
                "拉斐尔", "伽利略", "贝内代托", "朱塞佩", "维托里奥", "乌姆贝托", "加布里埃莱",
            ],
            female: [
                "卡特琳娜", "比安卡", "伊莎贝拉", "贝亚特丽切", "卢克雷齐娅", "玛格丽塔", "克拉丽斯", "朱莉娅", "露西亚", "安娜",
                "乔瓦娜", "玛丽亚", "西蒙内塔", "劳拉", "菲奥雷", "基娅拉", "奥林匹娅", "维多利亚", "卡米拉", "埃莱奥诺拉",
                "洛伦扎", "弗朗切斯卡", "阿涅塞", "科斯坦扎", "阿马拉松塔", "狄奥多林达", "阿德尔海德", "阿尔泰米西娅", "索福尼斯巴", "拉维妮娅",
                "阿德里亚娜", "费代丽卡", "朱塞皮娜", "罗萨尔芭", "菲洛梅娜", "欧金尼娅", "帕特里齐娅", "朱斯蒂娜", "西尔维娅", "弗拉维娅",
                "奥塔维亚", "马蒂尔德",
            ],
            houses: [
                "美第奇", "斯福尔扎", "维斯孔蒂", "埃斯特", "贡扎加", "博尔贾", "奥尔西尼", "科隆纳",
                "多里亚", "丹多洛", "莫切尼戈", "孔塔里尼", "斯卡拉", "蒙特费尔特罗", "马拉泰斯塔", "罗韦雷",
                "法尔内塞", "斯皮诺拉", "格里马尔迪", "巴尔迪", "佩鲁齐", "斯特罗齐", "皮蒂", "阿尔比齐",
                "特雷维桑", "格拉代尼戈", "萨努托", "奥尔德拉菲", "潘多尔菲尼", "卡拉拉", "特里武尔齐奥", "托雷",
                "马基雅维利", "加里波第", "萨伏依",
            ]
        ),
        "tibetan": CulturePeople(
            male: [
                "松赞干布", "赤松德赞", "赤祖德赞", "朗达玛", "芒松芒赞", "都松芒波杰", "赤德祖赞", "赤德松赞", "囊日松赞", "禄东赞",
                "钦陵", "赞婆", "尚结息", "吞弥", "贝若扎那", "莲花生", "米拉日巴", "玛尔巴", "宗喀巴", "八思巴",
                "绛曲坚赞", "根敦朱巴", "索南嘉措", "罗桑嘉措", "仓央嘉措", "颇罗鼐", "丹增", "扎西", "次仁", "顿珠",
                "旺堆", "平措", "格桑", "洛桑", "多吉", "尼玛", "达瓦", "边巴", "普布", "米玛",
                "拉巴", "桑吉", "强巴", "益西", "索朗",
            ],
            female: [
                "赤尊", "卓玛", "央金", "德吉", "拉姆", "曲珍", "央宗", "卓嘎", "白玛", "梅朵",
                "格桑梅朵", "达娃", "旺姆", "仓决", "益西", "措姆", "普赤", "琼达", "玉珍", "桑姆",
                "德央", "美朵", "巴桑", "次旦", "宗吉", "嘎玛", "贡觉", "吉宗", "朗杰", "拉珍",
                "尼珍", "边珍", "央拉", "仁青", "白珍",
            ],
            houses: [
                "悉补野", "没庐", "那囊", "琛", "蔡邦", "韦", "琼波", "噶尔",
                "朗", "桂", "尚", "属庐", "拔", "努", "觉若", "聂",
                "吞弥", "昆", "萨迦", "帕竹", "仁蚌", "辛厦", "多仁", "拉鲁",
                "擦绒", "索康", "夏格巴", "宇妥", "贡噶",
            ]
        ),
        "hungarian": CulturePeople(
            male: [
                "阿尔帕德", "伊什特万", "拉斯洛", "安德拉什", "贝拉", "盖佐", "卡尔曼", "伊姆雷", "拉约什", "马加什",
                "亚诺什", "山多尔", "费伦茨", "米克洛什", "久拉", "佐尔坦", "陶希", "塔克绍尼", "彼得", "萨穆埃尔",
                "奥托", "西蒙", "乔鲍", "格奥尔吉", "约瑟夫", "帕尔", "蒂博尔", "巴林特", "阿蒂拉", "多莫科什",
                "埃莱梅尔", "厄登", "法比安", "盖尔盖伊", "伊瓦尔", "卡罗伊", "马顿", "奥尔班", "罗兰", "维克托",
            ],
            female: [
                "吉塞拉", "伊丽莎白", "玛丽亚", "卡塔琳", "安娜", "艾尔莎", "伊洛娜", "尤迪特", "艾丽卡", "玛格达",
                "朱扎", "卡塔", "伊伦", "莉莉", "玛尔塔", "罗扎", "萨拉", "蒂梅娅", "维拉", "齐塔",
                "爱丽兹", "贝阿塔", "多拉", "艾斯特", "弗洛拉", "海伦", "伊达", "尤莉", "卡尔拉", "梅琳达",
                "诺拉", "奥尔加", "彼特拉", "蕾卡", "西尔维娅", "陶玛拉", "乌尔苏拉", "佐菲", "雅娜",
            ],
            houses: [
                "阿尔帕德", "匈雅提", "巴托里", "绍波尧伊", "拉科齐", "埃斯泰哈齐", "塞切尼", "布达伊",
                "久洛伊", "佩伦伊", "德拉什科维奇", "蒂萨", "安德拉希", "特勒基", "卡罗伊", "佐波尧",
                "乌伊拉基", "阿巴", "鲍蒂亚尼", "贝特伦", "奈道什迪", "帕尔菲", "伊莱什哈齐", "韦塞莱尼", "托尔迪",
            ]
        ),
        "polish": CulturePeople(
            male: [
                "梅什科", "波列斯瓦夫", "卡齐米日", "瓦迪斯瓦夫", "亨里克", "莱舍克", "康拉德", "普热梅斯瓦夫", "雅盖沃", "西吉斯蒙德",
                "斯特凡", "扬", "米哈乌", "奥古斯特", "斯坦尼斯瓦夫", "塔德乌什", "约瑟夫", "亚当", "弗里德里克", "马雷克",
                "帕韦乌", "托马什", "彼得", "安杰伊", "克日什托夫", "雅罗斯瓦夫", "维托尔德", "兹比格涅夫", "博格丹", "塞韦林",
                "多米尼克", "菲利普", "格热戈日", "伊格纳齐", "卡罗尔", "卢德维克", "马切伊", "尼古拉", "奥斯卡", "拉法乌",
                "希蒙", "特奥多尔", "瓦茨瓦夫", "阿尔贝特", "贝内迪克特", "切斯瓦夫", "达留什", "埃德蒙", "弗朗齐歇克",
            ],
            female: [
                "雅德维加", "多布拉娃", "安娜", "伊丽莎白", "芭芭拉", "博纳", "卡塔日娜", "玛格达莱娜", "玛丽亚", "索菲亚",
                "海伦娜", "阿格涅什卡", "约兰塔", "马尔戈热塔", "乌尔舒拉", "伊雷娜", "雅尼娜", "克里斯蒂娜", "阿莉娜", "贝阿塔",
                "采齐莉娅", "多罗塔", "埃娃", "弗洛伦蒂娜", "加布里埃拉", "哈利娜", "伊莎贝拉", "尤斯蒂娜", "卡罗利娜", "米罗斯瓦娃",
                "娜塔莉亚", "奥莉维亚", "罗莎莉亚", "斯坦尼斯瓦娃", "特蕾莎", "维罗妮卡", "兹奥菲娅", "亚历山德拉", "达努塔", "埃米莉亚",
            ],
            houses: [
                "皮雅斯特", "雅盖隆", "瓦萨", "波尼亚托夫斯基", "萨皮耶哈", "拉齐维乌", "扎莫伊斯基", "奥斯特罗格斯基",
                "恰尔托雷斯基", "波托茨基", "卢博米尔斯基", "索别斯基", "维希涅维茨基", "泰钦斯基", "奥列希尼茨基", "科涅茨波尔斯基",
                "托卡尔斯基", "热武斯基", "苏尔科夫斯基", "格罗霍夫斯基", "科希丘什科", "巴托雷", "东布罗夫斯基", "奥金斯基",
                "德鲁茨基", "兰茨科龙斯基", "布拉尼茨基", "梅莱钦斯基",
            ]
        ),
        "portuguese": CulturePeople(
            male: [
                "阿丰索", "桑舒", "迪尼什", "佩德罗", "费尔南多", "若昂", "杜阿尔特", "曼努埃尔", "塞巴斯蒂昂", "恩里克",
                "努诺", "瓦斯科", "巴尔托洛梅乌", "费尔南", "迪奥戈", "贡萨洛", "阿尔瓦罗", "路易斯", "若热", "弗朗西斯科",
                "安东尼奥", "卡洛斯", "米格尔", "拉斐尔", "蒂亚戈", "鲁伊", "若泽", "马里奥", "爱德华多", "费利佩",
                "吉列尔梅", "伊纳西奥", "劳伦索", "马尔蒂姆", "尼古劳", "奥斯瓦尔多", "保罗", "克里斯托旺", "达米昂", "埃斯特旺",
                "法比奥", "希尔", "伊拉里奥", "茹利奥", "莱昂内尔", "罗德里戈", "西芒", "维森特",
            ],
            female: [
                "伊莎贝尔", "莱奥诺尔", "特蕾莎", "乌拉卡", "玛法尔达", "贝亚特丽斯", "菲利帕", "若安娜", "卡塔琳娜", "玛丽亚",
                "伊内斯", "布兰卡", "康斯坦萨", "桑沙", "多罗特娅", "安娜", "露西亚", "克拉拉", "弗朗西斯卡", "加布里埃拉",
                "海伦娜", "伊里亚", "茹莉娅", "劳拉", "玛尔塔", "娜塔莉娅", "奥莉维亚", "保拉", "丽塔", "索菲娅",
                "维多利亚", "阿梅莉亚", "卡米拉", "丹妮埃拉", "埃米莉娅", "法蒂玛", "格拉萨", "伊莎多拉", "卢尔德", "罗莎", "西尔维娅",
            ],
            houses: [
                "阿维斯", "布拉干萨", "勃艮第", "伽马", "迪亚士", "卡布拉尔", "麦哲伦", "阿尔布开克",
                "梅内塞斯", "佩雷拉", "索萨", "库尼亚", "卡斯特罗", "阿尔梅达", "科蒂尼奥", "梅洛",
                "诺罗尼亚", "阿泰德", "马斯卡雷尼亚什", "莫赖斯", "莱莫斯", "阿泽维多", "科斯塔", "法里亚",
                "桑帕约", "卡瓦略", "利马", "卢塞纳", "维列纳", "塔沃拉",
            ]
        ),
        "dutch": CulturePeople(
            male: [
                "威廉", "莫里斯", "弗雷德里克", "约翰", "扬", "彼得", "科内利斯", "亨德里克", "雅各布", "迪尔克",
                "伦勃朗", "伊拉斯谟", "胡戈", "安东尼", "阿德里安", "巴尔塔扎", "克拉斯", "达恩", "埃弗特", "弗洛里斯",
                "赫里特", "赫尔曼", "伊萨克", "约斯特", "卡雷尔", "勒内", "马尔滕", "尼古拉斯", "奥托", "保卢斯",
                "鲁特格", "西蒙", "特奥", "沃特", "约里斯", "巴伦支", "阿尔伯特", "伯纳德", "克里斯蒂安", "皮特",
            ],
            female: [
                "玛丽亚", "安娜", "卡塔琳娜", "伊丽莎白", "玛格丽特", "威廉明娜", "朱丽安娜", "贝娅特丽克丝", "阿玛莉娅", "路易丝",
                "海伦娜", "约翰娜", "科内莉亚", "亨德里卡", "雅各巴", "萨斯基亚", "赫尔特鲁伊", "阿格尼丝", "芭芭拉", "克拉拉",
                "多罗特娅", "埃尔丝", "弗洛拉", "格蕾塔", "哈纳", "伊尔泽", "卡琳", "莉丝贝特", "马尔特", "娜塔莎",
                "奥蒂莉", "彼得罗妮拉", "苏珊娜", "乌尔苏拉", "阿德里安娜", "贝尔塔", "迪安娜", "埃弗琳",
            ],
            houses: [
                "奥兰治", "拿骚", "维尔", "德维特", "奥尔登巴内费尔特", "吕恩", "鲁伊特", "特龙普",
                "哈伦", "赫鲁特", "埃格蒙特", "霍恩", "布雷德罗德", "阿克尔", "贝弗韦克", "赫姆斯凯克",
                "科宁", "迪克", "艾克", "弗里斯", "扬森", "贝格", "巴克", "维瑟",
                "斯米特", "梅耶尔", "穆德", "惠更斯", "塔斯曼", "格劳秀斯",
            ]
        ),
        "aztec": CulturePeople(
            male: [
                "阿卡马皮奇特利", "威齐利维特尔", "奇马尔波波卡", "伊茨科瓦特尔", "蒙特祖马", "阿哈亚卡特尔", "蒂索克", "阿维索特尔", "夸乌特莫克", "奎特拉瓦克",
                "内萨瓦尔科约特尔", "内萨瓦尔皮利", "特拉卡埃莱尔", "夸乌特莱", "奥克特利", "伊茨利", "奇马尔", "托皮尔岑", "米斯科瓦特尔", "特佩约洛特尔",
                "夸乌蒂", "纳瓦尔", "特克西", "伊斯特利", "马萨特尔", "奥索马特利", "特佩特利", "阿卡特尔", "科阿特尔", "埃埃卡特尔",
                "克特萨尔", "托纳蒂乌", "夏洛特尔", "约洛", "萨卡特尔", "科斯卡", "伊斯塔克", "特斯卡",
            ],
            female: [
                "特库伊奇波", "阿托托斯特利", "马琳切", "伊斯塔西瓦特尔", "科约尔沙乌基", "乔奇特尔", "特拉索尔特奥特尔", "奇科梅科阿特尔", "玛雅韦尔", "夏洛奇特尔",
                "奇马尔马", "阿托特尔", "夸乌特利", "马林辛", "托纳辛", "约洛特尔", "塞特利", "阿玛特尔", "科阿特利", "伊斯基",
                "米特利", "帕帕洛特尔", "克特萨利", "夏洛", "托奇", "阿卡", "伊茨", "科约", "纳瓦", "维蒂",
            ],
            houses: [
                "墨西卡", "阿科尔瓦", "特帕内卡", "特拉斯卡拉", "乔卢拉", "霍奇米尔卡", "查尔卡", "奥托米",
                "托尔特克", "奇奇梅卡", "瓦斯特克", "托托纳克", "米斯特克", "萨波特克", "塔拉斯卡", "普雷佩查",
                "奥尔梅克", "特奥蒂瓦坎", "库伊奎尔科", "特拉特洛尔卡", "阿斯卡波察尔卡", "特斯科卡", "特拉科潘卡", "库奥瓦卡",
                "伊斯塔帕拉卡", "奇马尔瓦卡", "米斯基卡", "夸乌蒂特拉卡", "托卢卡", "夸纳瓦卡",
            ]
        ),
        "inca": CulturePeople(
            male: [
                "曼科", "辛奇", "略克", "迈塔", "卡帕克", "罗卡", "亚瓦尔", "维拉科查", "帕查库特克", "图帕克",
                "瓦伊纳", "瓦斯卡尔", "阿塔瓦尔帕", "萨伊里", "蒂图", "阿马鲁", "鲁米尼亚维", "基斯基斯", "查尔库奇马", "奥兰泰",
                "瓦曼", "乌斯卡", "库西", "伊拉帕", "帕乌卢", "基斯佩", "查斯卡", "印蒂", "帕查", "乌尔科",
                "尤潘基", "马丘", "卡里", "塔基",
            ],
            female: [
                "奥克略", "瓦科", "阿纳瓦尔克", "奇米普夸", "科拉", "奇姆博", "伊皮", "基利亚", "查斯卡", "阿伊利",
                "伊玛", "妮娜", "帕卡", "苏玛", "塔西", "乌米娜", "瓦伊塔", "约丽", "安塔", "伊楚",
                "玛伊", "努那", "帕瓦", "罗娜", "赛萨", "托塔", "乌尔皮", "维拉", "亚库", "阿马拉",
                "金塔", "拉伊",
            ],
            houses: [
                "契马", "拉乌拉", "阿瓦伊尼", "乌斯卡", "阿普迈塔", "维卡基拉奥", "索克索", "印卡",
                "卡帕克", "图帕克", "瓦斯卡尔", "卡尼亚里", "昌卡", "奇穆", "卡哈马卡", "瓦恩卡",
                "科利亚", "卢帕卡", "基图", "帕查卡马克", "纳斯卡", "莫切", "瓦里", "蒂瓦纳库",
                "塔兰", "奇卡马", "钦查", "卡尼亚", "普鲁瓦", "马普切",
            ]
        ),
    ]

    /// 供 App 世界取某文化男/女名池（优先纯净目录，并叠加玩家在「文化编辑」里自定义的名字）。
    public static func givenNames(_ r: JS, culture: String, gender: Int) -> [String] {
        var list = (gender == 0 ? people[culture]?.male : people[culture]?.female) ?? []
        if list.isEmpty {
            let p = Nobility.cultures[culture]
            let src = gender == 0 ? p.givenMale : p.givenFemale
            if case .array = src.storage {
                list = src.asArray.map(\.asString)
            }
        }
        if !r.regimes.isNull {
            let added = r.regimes.cultures[culture][gender == 0 ? "male" : "female"]
            if case .array = added.storage {
                for a in added.asArray.map(\.asString) where !a.isEmpty && !list.contains(a) { list.append(a) }
            }
        }
        if list.isEmpty {
            let fallback = people["chinese"]
            list = (gender == 0 ? fallback?.male : fallback?.female) ?? ["明远"]
        }
        return list
    }

    /// 供 App 世界取某文化家族姓氏池（已清洗无重复，自定义文化兜底绝不为空）。
    public static func houseNames(culture: String) -> [String] {
        if let list = people[culture]?.houses, !list.isEmpty { return list }
        let p = Nobility.cultures[culture]
        var seen = Set<String>(), out = [String]()
        if case .array = p.houses.storage {
            for raw in p.houses.asArray.map(\.asString) {
                let s = cleanSurname(raw)
                if !s.isEmpty && seen.insert(s).inserted { out.append(s) }
            }
        }
        return out.isEmpty ? (people["chinese"]?.houses ?? ["林"]) : out
    }

    /// 供 App 世界取某文化国名候选池（历史模式 = 清洗后的历史库 + 纯净补充库 + 现代地理库；架空模式 = 地道架空国名池）。
    public static func statePool(culture: String, mode: String, styleId: String? = nil) -> [String] {
        var seen = Set<String>(), out = [String]()
        func append(_ raw: String) {
            let s = cleanStateBase(raw)
            let key = canonicalStateKey(s)
            if !s.isEmpty && !key.isEmpty && seen.insert(key).inserted { out.append(s) }
        }
        let isModern = styleId.map { modernPolityStyles.contains($0) } ?? false
        let isMonarchy = styleId.map { ["dynasty", "empire", "despotism", "absolute", "feudal", "principality", "elective", "regency"].contains($0) } ?? false
        if isModern {
            for s in modernRegionStates[culture] ?? [] { append(s) }
        } else if styleId == "dynasty" || (culture == "chinese" && isMonarchy) {
            for s in dynastyPool(culture: culture) { append(s) }
        }
        if mode == "historical-names" {
            if let profile = Founding.cultures.first(where: { $0.id == culture }) {
                for s in profile.historicalStates where !(isModern && isDynasticBase(s, culture: culture)) { append(s) }
            }
            for s in historicalExtraStates[culture] ?? [] where !(isModern && isDynasticBase(s, culture: culture)) { append(s) }
            if !isMonarchy || culture != "chinese" {
                for s in modernRegionStates[culture] ?? [] { append(s) }
            }
            for s in fantasyStates[culture] ?? [] where !(isModern && isDynasticBase(s, culture: culture)) { append(s) }
            if isMonarchy && culture == "chinese" {
                for s in modernRegionStates[culture] ?? [] { append(s) }
            }
        } else {
            for s in fantasyStates[culture] ?? [] where !(isModern && isDynasticBase(s, culture: culture)) { append(s) }
            for s in modernRegionStates[culture] ?? [] { append(s) }
            if out.isEmpty, let profile = Founding.cultures.first(where: { $0.id == culture }) {
                for r in profile.stateRoots {
                    for e in profile.stateEnds where r != e && !r.isEmpty { append(r + e) }
                }
            }
        }
        return out
    }

    /// 按确定性散列从候选池中挑一个未被 `used`（按规范核心键）占用的国名基名；池用尽时以雅致方位冠字派生，绝不重复。
    public static func pickStateBase(culture: String, mode: String, seed: String, used: Set<String>, styleId: String? = nil) -> String? {
        let pool = statePool(culture: culture, mode: mode, styleId: styleId)
        guard !pool.isEmpty else { return nil }
        let usedKeys = Set(used.flatMap { [$0, cleanStateBase($0), canonicalStateKey($0)] })
        let start = Int(Opening.hash(seed) % UInt32(pool.count))
        for step in 0..<pool.count {
            let pick = pool[(start + step) % pool.count]
            let key = canonicalStateKey(pick)
            if !usedKeys.contains(pick) && !usedKeys.contains(key) { return pick }
        }
        // 极端长局（单文化超过 200 国）：以方位/新字雅致派生，绝不卡死在某一个旧名上。
        let prefixes = culture == "chinese" ? ["新", "东", "西", "南", "北", "上", "下", "中", "古", "永"] : ["新", "东", "西", "南", "北", "上", "下"]
        for p in prefixes {
            for step in 0..<pool.count {
                let raw = pool[(start + step) % pool.count]
                guard !raw.hasPrefix(p), raw.count <= 4 else { continue }
                let cand = p + raw
                let key = canonicalStateKey(cand)
                if !usedKeys.contains(cand) && !usedKeys.contains(key) { return cand }
            }
        }
        return pool[start]
    }
}
