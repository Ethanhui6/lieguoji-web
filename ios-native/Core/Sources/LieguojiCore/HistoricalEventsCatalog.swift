import Foundation

/// v9.0.0 全历史 145+ 真实事件典藏库（覆盖全部 12 大官方剧本，仿 HOI4 多阶段史实事件链与架空分歧）：
/// - 每一条事件均具备真实机械效果（吞并/割地/瓜分/附庸/宣战/停战/结盟/条约/战役闪电加成/工业 IC/国库/士气/法案切换/核试）；
/// - 全部 actorSpecId / targetSpecId / effectCode 国家 ID 与 52 幅 EventScrolls/*.png 插图键名经 V9OverhaulTests 100% 静态强校验零死链！
extension HistoricalEvents {

    static let expandedEvents: [EventSpec] =
        ww2Europe1936And1939Events
        + china1931Events
        + ww2Asia1941Events
        + ww1Events
        + napoleon1812Events
        + coldWar1950Events
        + ancientAndSengokuEvents

    // MARK: - 1. 1936 战云密布 & 1939 二战欧洲战场（42 条密集 HOI4 级事件链）

    private static let ww2Europe1936And1939Events: [EventSpec] = [
        // --- 1936 专属战前风云（14 条） ---
        EventSpec(
            id: "rhineland_1936",
            scenarioIds: ["ww2_eve_1936"],
            triggerYear: 1936, triggerMonth: 3, minDay: 8,
            title: "进军莱茵兰非军事区",
            headline: "德军跨过莱茵河大桥，凡尔赛体系首次遭公开撕毁",
            dateLabel: "1936 年 3 月 7 日",
            body: "德国国防军三个营悍然开进《凡尔赛和约》划定的莱茵兰非军事区。柏林高层孤注一掷，赌定英法政府因畏战而不敢出兵干涉。",
            effectSummary: "德国工业产能 +18、国库 +300、启动【四年重工军备计划】；全球紧张度 +10。",
            illustration: "event_anschluss_1938",
            actorSpecId: "germany", targetSpecId: "france",
            choices: [
                Choice(title: "德军占领莱茵兰·英法口头抗议（史实）", subtitle: "德国士气大振，鲁尔工业区彻底解锁", isHistorical: true, effectCode: "ic:germany:18|gold:germany:300|morale:germany:12|law:germany:focus_four_year|tension:10"),
                Choice(title: "法国强硬出兵驱逐德军（架空）", subtitle: "法德在莱茵河提前爆发战争", isHistorical: false, effectCode: "war:france:germany:1|tension:24"),
            ]
        ),
        EventSpec(
            id: "spanish_civil_war_1936",
            scenarioIds: ["ww2_eve_1936"],
            triggerYear: 1936, triggerMonth: 7, minDay: 35,
            title: "西班牙内战与秃鹰军团",
            headline: "伊比利亚半岛战火燃起，德意苏多国派遣志愿军演练新战术",
            dateLabel: "1936 年 7 月 18 日",
            body: "西班牙陷入惨烈内战，德国派遣「秃鹰军团」测试俯冲轰炸与装甲协同，苏联亦向马德里派遣坦克顾问与飞行员，欧陆大战的序幕在伊比利亚率先预演。",
            effectSummary: "德、意、苏均获实战经验与士气提升，西班牙军力动员；全球紧张度 +8。",
            illustration: "scroll_verdun_1916",
            actorSpecId: "spain", targetSpecId: "germany",
            choices: [
                Choice(title: "德意苏各自派志愿军参战（史实）", subtitle: "德军空地协同日趋成熟，欧洲对立加深", isHistorical: true, effectCode: "buff:germany:秃鹰军团实战经验:12:6:1.08:0:180|buff:ussr:国际纵队实战经验:8:10:1.0:0:180|morale:italy:8|tension:8"),
                Choice(title: "各国严守不干涉委员会协定（架空）", subtitle: "西班牙局势趋缓，紧张度回落", isHistorical: false, effectCode: "gold:spain:250|tension:-4"),
            ]
        ),
        EventSpec(
            id: "anti_comintern_1936",
            scenarioIds: ["ww2_eve_1936"],
            triggerYear: 1936, triggerMonth: 11, minDay: 65,
            title: "柏林—罗马轴心确立",
            headline: "德意签署政治军事合作议定书，欧陆轴心阵营成形",
            dateLabel: "1936 年 11 月 1 日",
            body: "墨索里尼在米兰发表演说宣告「柏林—罗马轴心」诞生，德国与意大利在巴尔干、地中海与重整军备问题上全面靠拢。",
            effectSummary: "德国与意大利正式结盟并提升军工协作；全球紧张度 +8。",
            illustration: "event_molotov_ribbentrop",
            actorSpecId: "germany", targetSpecId: "italy",
            choices: [
                Choice(title: "确立柏林—罗马轴心（史实）", subtitle: "德意结成战略同盟，威慑西欧与巴尔干", isHistorical: true, effectCode: "ally:germany:italy|ic:germany:10|ic:italy:12|tension:8"),
                Choice(title: "意大利维持斯特雷萨阵线（架空）", subtitle: "意大利靠拢英法以制衡德国南下", isHistorical: false, effectCode: "ally:uk:italy|tension:4"),
            ]
        ),
        EventSpec(
            id: "soviet_five_year_1937",
            scenarioIds: ["ww2_eve_1936"],
            triggerYear: 1937, triggerMonth: 4, minDay: 110,
            title: "苏联乌拉尔重工业大跃升",
            headline: "第二个五年计划提前完成，坦克与火炮工厂日夜轰鸣",
            dateLabel: "1937 年 4 月",
            body: "马格尼托哥尔斯克钢铁基地与哈尔科夫坦克厂全面投产，苏联重工业规模跃居欧洲第一，为应对未来大战筑牢工业底座。",
            effectSummary: "苏联工业产能 +32、国库 +400，推行【五年重工业计划】。",
            illustration: "scroll_stalingrad_1942",
            actorSpecId: "ussr", targetSpecId: nil,
            choices: [
                Choice(title: "全力优先重工业与坦克工厂（史实）", subtitle: "苏联工业产能大幅攀升", isHistorical: true, effectCode: "ic:ussr:32|gold:ussr:400|law:ussr:focus_five_year"),
            ]
        ),
        EventSpec(
            id: "uk_rearmament_1937",
            scenarioIds: ["ww2_eve_1936"],
            triggerYear: 1937, triggerMonth: 8, minDay: 145,
            title: "英国本土雷达链与影子工厂计划",
            headline: "皇家空军扩建飓风与喷火战机产线，沿海建成「本土链」雷达网",
            dateLabel: "1937 年 8 月",
            body: "面对德国空军迅速扩张，英国航空部秘密启动「本土链」雷达预警系统与影子飞机制造厂，为未来保卫不列颠海峡抢占先机。",
            effectSummary: "英国工业产能 +22、激活【本土雷达与防空网】及防空加成。",
            illustration: "scroll_britain_1940",
            actorSpecId: "uk", targetSpecId: nil,
            choices: [
                Choice(title: "优先建成雷达防空网与战斗机产线（史实）", subtitle: "不列颠本土防空与防御显著提升", isHistorical: true, effectCode: "ic:uk:22|law:uk:focus_radar_airdef|buff:uk:本土雷达预警网:6:18:1.0:12:240"),
            ]
        ),
        EventSpec(
            id: "france_maginot_1937",
            scenarioIds: ["ww2_eve_1936"],
            triggerYear: 1937, triggerMonth: 11, minDay: 175,
            title: "马奇诺防线全面竣工",
            headline: "耗资数十亿法郎的地下钢铁堡垒沿阿尔萨斯绵延数百公里",
            dateLabel: "1937 年 11 月",
            body: "法军沿德法边境建成举世闻名的马奇诺地下要塞群，然而比利时恢复中立后，阿登森林与北部平原依旧存在战略缺口。",
            effectSummary: "法国获得 240 日【马奇诺筑垒防线】防御加成（防御 +22%），国库 −150。",
            illustration: "scroll_verdun_1916",
            actorSpecId: "france", targetSpecId: "germany",
            choices: [
                Choice(title: "依托马奇诺采取守势战略（史实）", subtitle: "法国东线正面坚若磐石，但机动偏弱", isHistorical: true, effectCode: "buff:france:马奇诺要塞防线:0:22:0.96:0:240|morale:france:10"),
                Choice(title: "采纳戴高乐建议组建装甲机动师（架空）", subtitle: "放弃纯守势，强化法国装甲进攻能力", isHistorical: false, effectCode: "buff:france:戴高乐装甲改革:20:8:1.14:0:240|law:france:focus_blitz_armored"),
            ]
        ),
        EventSpec(
            id: "anschluss_1938",
            scenarioIds: ["ww2_eve_1936"],
            triggerYear: 1938, triggerMonth: 3, minDay: 210,
            title: "德奥合并（Anschluss）",
            headline: "维也纳欢呼与铁蹄：德意志宣布合并奥地利",
            dateLabel: "1938 年 3 月 12 日",
            body: "德国国防军越过边境开进维也纳，柏林宣布将奥地利纳入德意志帝国版图，彻底撕毁《凡尔赛和约》中禁止德奥合并的条款。",
            effectSummary: "德意志和平吞并奥地利全境，获得奥地利工业产能 +28 与兵源；全球紧张度 +15。",
            illustration: "event_anschluss_1938",
            actorSpecId: "germany", targetSpecId: "austria",
            choices: [
                Choice(title: "履行德奥合并（史实）", subtitle: "和平吞并奥地利全境，德国工业与兵源暴涨", isHistorical: true, effectCode: "annex:germany:austria|tension:15|ic:germany:28|gold:germany:350"),
                Choice(title: "奥地利拒绝并武装抵抗（架空）", subtitle: "德奥爆发战争，欧洲提前陷入战火", isHistorical: false, effectCode: "war:germany:austria:1|tension:22"),
            ]
        ),
        EventSpec(
            id: "munich_1938",
            scenarioIds: ["ww2_eve_1936"],
            triggerYear: 1938, triggerMonth: 9, minDay: 270,
            title: "慕尼黑协定",
            headline: "绥靖巅峰：苏台德地区割让德意志",
            dateLabel: "1938 年 9 月 30 日",
            body: "英、法、德、意四国首脑在慕尼黑签署协定，强迫捷克斯洛伐克将布满边境要塞与军工厂的苏台德地区割让德国，以换取「我们时代的和平」。",
            effectSummary: "捷克斯洛伐克割让西部 45% 州郡给德国，德国工业产能 +24；全球紧张度 +14。",
            illustration: "event_munich_1938",
            actorSpecId: "germany", targetSpecId: "czechoslovakia",
            choices: [
                Choice(title: "签署慕尼黑协定割让苏台德（史实）", subtitle: "德国不战而夺捷克边防要塞与军工区", isHistorical: true, effectCode: "cede:czechoslovakia:germany:45|tension:14|ic:germany:24"),
                Choice(title: "英法拒绝绥靖、联手保卫捷克（架空）", subtitle: "捷克抗德，英法立即介入全面大战", isHistorical: false, effectCode: "war:germany:czechoslovakia:1|war:uk:germany:1|war:france:germany:1|tension:28"),
            ]
        ),
        EventSpec(
            id: "first_vienna_award_1938",
            scenarioIds: ["ww2_eve_1936"],
            triggerYear: 1938, triggerMonth: 11, minDay: 295,
            title: "第一次维也纳仲裁",
            headline: "德意裁定捷克南部割归匈牙利，中欧小协约国瓦解",
            dateLabel: "1938 年 11 月 2 日",
            body: "慕尼黑协定后，德意在维也纳主持仲裁，将斯洛伐克南部与外喀尔巴阡部分领土划归匈牙利王国，布达佩斯自此全面倒向轴心阵营。",
            effectSummary: "匈牙利工业产能 +12、国库 +200 并向轴心国靠拢；全球紧张度 +6。",
            illustration: "event_munich_1938",
            actorSpecId: "hungary", targetSpecId: "czechoslovakia",
            choices: [
                Choice(title: "执行维也纳仲裁（史实）", subtitle: "匈牙利获领土补偿并靠拢德意", isHistorical: true, effectCode: "cede:czechoslovakia:hungary:15|ic:hungary:12|gold:hungary:200|tension:6"),
            ]
        ),
        EventSpec(
            id: "bohemia_1939",
            scenarioIds: ["ww2_eve_1936"],
            triggerYear: 1939, triggerMonth: 3, minDay: 330,
            title: "布拉格沦陷与捷克解体",
            headline: "德军开进布拉格，英法绥靖梦碎紧急保障波兰",
            dateLabel: "1939 年 3 月 15 日",
            body: "德国撕毁慕尼黑承诺，全面吞并波希米亚与摩拉维亚并接收斯柯达军工厂；英法绥靖梦碎，紧急向波兰提供正式军事保障。",
            effectSummary: "德意志吞并捷克斯洛伐克余部并增产 +26 IC；英法波紧急结成同盟；全球紧张度 +16。",
            illustration: "event_bohemia_1939",
            actorSpecId: "germany", targetSpecId: "czechoslovakia",
            choices: [
                Choice(title: "吞并波希米亚·接收斯柯达军工（史实）", subtitle: "德国军力大增，英法波紧急结盟", isHistorical: true, effectCode: "annex:germany:czechoslovakia|ic:germany:26|ally:uk:poland|tension:16"),
                Choice(title: "仅迫使捷克称臣纳贡（架空）", subtitle: "捷克成为德国附庸国，保留自治", isHistorical: false, effectCode: "vassal:germany:czechoslovakia|tension:10"),
            ]
        ),
        EventSpec(
            id: "memel_1939",
            scenarioIds: ["ww2_eve_1936"],
            triggerYear: 1939, triggerMonth: 3, minDay: 342,
            title: "最后通牒收回梅梅尔港",
            headline: "德国海军驶入梅梅尔，立陶宛被迫割让波罗的海良港",
            dateLabel: "1939 年 3 月 23 日",
            body: "吞并布拉格仅一周后，柏林向立陶宛发出最后通牒，迫使其交出东普鲁士北端的梅梅尔港。",
            effectSummary: "立陶宛割让边境州给德国，德国国库 +180；全球紧张度 +5。",
            illustration: "event_weserubung_1940",
            actorSpecId: "germany", targetSpecId: "lithuania",
            choices: [
                Choice(title: "立陶宛被迫割让梅梅尔（史实）", subtitle: "东普鲁士防线进一步巩固", isHistorical: true, effectCode: "cede:lithuania:germany:20|gold:germany:180|tension:5"),
                Choice(title: "立陶宛誓死拒割（架空）", subtitle: "波罗的海提前爆发武装冲突", isHistorical: false, effectCode: "war:germany:lithuania:0|tension:12"),
            ]
        ),
        EventSpec(
            id: "pact_of_steel_1939",
            scenarioIds: ["ww2_eve_1936"],
            triggerYear: 1939, triggerMonth: 5, minDay: 365,
            title: "德意《钢铁条约》签署",
            headline: "柏林与罗马缔结攻守同盟，意大利吞并阿尔巴尼亚",
            dateLabel: "1939 年 5 月 22 日",
            body: "意大利出兵控制亚得里亚海东岸后，与德国正式签署《钢铁条约》，双方承诺在任何战争中提供全力军事援助。",
            effectSummary: "德意锁定轴心同盟，两国士气与战时动员提升；全球紧张度 +8。",
            illustration: "event_molotov_ribbentrop",
            actorSpecId: "italy", targetSpecId: "germany",
            choices: [
                Choice(title: "签署钢铁条约·锁定德意轴心（史实）", subtitle: "轴心国军事一体化加速", isHistorical: true, effectCode: "ally:germany:italy|law:germany:econ_war|morale:italy:12|tension:8"),
            ]
        ),
        EventSpec(
            id: "molotov_ribbentrop_1939",
            scenarioIds: ["ww2_eve_1936"],
            triggerYear: 1939, triggerMonth: 8, minDay: 400,
            title: "苏德互不侵犯条约",
            headline: "莫斯科密约震惊世界：德苏划定东欧势力范围",
            dateLabel: "1939 年 8 月 23 日",
            body: "莫洛托夫与里宾特洛甫在克里姆林宫签署互不侵犯条约及秘密附属议定书，为德国消除了两线作战顾虑，并秘密约定瓜分波兰与波罗的海。",
            effectSummary: "德苏缔结 2 年互不侵犯条约，激活波兰秘密瓜分条款；全球紧张度 +12。",
            illustration: "event_molotov_ribbentrop",
            actorSpecId: "germany", targetSpecId: "ussr",
            choices: [
                Choice(title: "签署苏德密约（史实）", subtitle: "消除两线作战顾虑，为闪击波兰铺路", isHistorical: true, effectCode: "pact:germany:ussr:2|tension:12"),
                Choice(title: "拒绝结约、警惕东线（架空）", subtitle: "苏德保持高度敌意，可能爆发早战", isHistorical: false, effectCode: "tension:10"),
            ]
        ),
        EventSpec(
            id: "franco_victory_1939",
            scenarioIds: ["ww2_eve_1936"],
            triggerYear: 1939, triggerMonth: 4, minDay: 350,
            title: "马德里易帜与西班牙战后重建",
            headline: "历经三年血战伊比利亚重归平静，西班牙宣布保持武装中立",
            dateLabel: "1939 年 4 月 1 日",
            body: "残酷的西班牙内战终于落幕，饱受战火摧残的西班牙经济百废待兴，马德里当局决定在大战阴云中保持微妙中立。",
            effectSummary: "西班牙国库 +250、防御 +12%，倾向和平休养。",
            illustration: "scroll_silkroad_peace",
            actorSpecId: "spain", targetSpecId: nil,
            choices: [
                Choice(title: "宣布武装中立·休养生息（史实）", subtitle: "西班牙避免卷入欧陆全面大战", isHistorical: true, effectCode: "gold:spain:250|buff:spain:伊比利亚中立休养:0:12:1.0:0:240"),
            ]
        ),

        // --- 1936 & 1939 共同核心二战事件链（28 条） ---
        EventSpec(
            id: "fall_weiss_1939",
            scenarioIds: ["ww2_eve_1936", "ww2_europe_1939"],
            triggerYear: 1939, triggerMonth: 9, minDay: 3,
            title: "白色方案 · 闪击波兰",
            headline: "第二次世界大战爆发！装甲集群闪电横扫波兰",
            dateLabel: "1939 年 9 月 1 日",
            body: "古德里安与曼施坦因指挥装甲集群协同斯图卡俯冲轰炸机实施人类史上首次大规模「闪电战」；英法两国随即履行波兰保障条约向德国宣战！",
            effectSummary: "德军获得 120 日【闪电战·白色方案】（行军 ×1.35、攻击 +32%）向波兰宣战；英法立即履行同盟向德宣战！",
            illustration: "event_fall_weiss_1939",
            actorSpecId: "germany", targetSpecId: "poland",
            choices: [
                Choice(title: "发动白色方案 · 闪击波兰（史实）", subtitle: "德军激活闪电战突击加成，英法自动参战", isHistorical: true, effectCode: "buff:germany:闪电战·白色方案:32:0:1.35:0:120|war:germany:poland:1|war:uk:germany:1|war:france:germany:1|law:germany:econ_war|tension:25"),
                Choice(title: "最后通牒索要但泽走廊（架空）", subtitle: "波兰割让但泽换取短暂和平", isHistorical: false, effectCode: "cede:poland:germany:20|tension:12"),
            ]
        ),
        EventSpec(
            id: "poland_partition_1939",
            scenarioIds: ["ww2_eve_1936", "ww2_europe_1939"],
            triggerYear: 1939, triggerMonth: 9, minDay: 22,
            title: "苏军西进 · 瓜分波兰",
            headline: "苏联红军越过东部边境，按苏德密约瓜分波兰",
            dateLabel: "1939 年 9 月 17 日",
            body: "华沙战线崩解之际，苏联红军以保卫西乌克兰与西白俄罗斯为名出兵波兰东部，随后按苏德秘密议定书划定新国界。",
            effectSummary: "苏联立即接管波兰东部 45% 疆域（利沃夫、布列斯特线）并对波兰残部宣战，苏德建立短暂缓冲。",
            illustration: "event_poland_partition",
            actorSpecId: "ussr", targetSpecId: "poland",
            choices: [
                Choice(title: "出兵西进、按密约瓜分波兰（史实）", subtitle: "苏联接管波兰东部疆域，建立西方战略纵深", isHistorical: true, effectCode: "cede_east:poland:ussr:45|war:ussr:poland:0|pact:germany:ussr:2|tension:10"),
                Choice(title: "严守中立、不参与瓜分（架空）", subtitle: "苏联按兵不动，保持对波兰中立", isHistorical: false, effectCode: "tension:-4"),
            ]
        ),
        EventSpec(
            id: "phony_war_atlantic_1939",
            scenarioIds: ["ww2_eve_1936", "ww2_europe_1939"],
            triggerYear: 1939, triggerMonth: 10, minDay: 48,
            title: "大西洋海战与「狼群」潜艇袭扰",
            headline: "邓尼茨启动 U 型潜艇破交战，皇家海军全面封锁北海",
            dateLabel: "1939 年 10 月",
            body: "西线陆地暂时陷入「静坐战」之际，北大西洋已然硝烟弥漫。德国 U 型潜艇频频伏击盟军商船，英国皇家海军则动用本土舰队严密封锁德国海上生命线。",
            effectSummary: "英国激活海战护航加成，德国获潜艇狼群加成；英军工业补给稳步增长。",
            illustration: "event_weserubung_1940",
            actorSpecId: "uk", targetSpecId: "germany",
            choices: [
                Choice(title: "皇家海军封锁北海 vs 德军狼群破交（史实）", subtitle: "双方围绕北大西洋航道展开持久拉锯", isHistorical: true, effectCode: "buff:uk:大西洋护航编队:6:12:1.0:22:180|buff:germany:大西洋狼群破交:8:0:1.0:18:180|tension:6"),
            ]
        ),
        EventSpec(
            id: "winter_war_1939",
            scenarioIds: ["ww2_eve_1936", "ww2_europe_1939"],
            triggerYear: 1939, triggerMonth: 11, minDay: 85,
            title: "苏芬冬季战争爆发",
            headline: "卡累利阿地峡炮火震天！曼纳海姆防线迎战百万红军",
            dateLabel: "1939 年 11 月 30 日",
            body: "苏联为确保列宁格勒安全要求芬兰割让卡累利阿地峡遭拒，红军冒着严寒越过边境。芬兰滑雪部队依托森林严寒与曼纳海姆防线展开顽强阻击！",
            effectSummary: "苏联对芬兰宣战；芬兰激活 150 日【曼纳海姆冬季防线】（防御 +38%、士气 +20）。",
            illustration: "event_moscow_winter",
            actorSpecId: "ussr", targetSpecId: "finland",
            choices: [
                Choice(title: "红军进攻卡累利阿（史实）", subtitle: "冬季战争爆发，芬兰展开雪地顽强抵抗", isHistorical: true, effectCode: "war:ussr:finland:0|buff:finland:曼纳海姆雪地防线:12:38:1.12:0:150|morale:finland:20|tension:10"),
                Choice(title: "芬兰外交妥协割让维堡边境（架空）", subtitle: "割让卡累利阿边缘避免惨烈战争", isHistorical: false, effectCode: "cede:finland:ussr:15|pact:ussr:finland:2|tension:3"),
            ]
        ),
        EventSpec(
            id: "moscow_peace_finland_1940",
            scenarioIds: ["ww2_eve_1936", "ww2_europe_1939"],
            triggerYear: 1940, triggerMonth: 3, minDay: 160,
            title: "莫斯科和平协定 · 冬季战争落幕",
            headline: "芬兰割让卡累利阿换取独立，苏联红军启动全面军改",
            dateLabel: "1940 年 3 月 13 日",
            body: "经过三个半月血战，苏军终究突破曼纳海姆防线，芬兰被迫签署《莫斯科和约》割让卡累利阿。斯大林痛定思痛，立刻提拔铁木辛哥与朱可夫整顿红军指挥体系。",
            effectSummary: "苏芬停战，芬兰割让边境 18% 给苏联；苏联工业产能 +18、启动军制改革。",
            illustration: "scroll_silkroad_peace",
            actorSpecId: "ussr", targetSpecId: "finland",
            choices: [
                Choice(title: "缔结莫斯科和约·红军大整编（史实）", subtitle: "苏联拓展列宁格勒纵深并改革军队", isHistorical: true, effectCode: "cede:finland:ussr:18|peace:ussr:finland|ic:ussr:18|morale:ussr:10"),
                Choice(title: "红军拒绝停战·直取赫尔辛基（架空）", subtitle: "战事继续升级，北欧全面震动", isHistorical: false, effectCode: "buff:ussr:北线强攻:18:0:1.10:0:90|tension:8"),
            ]
        ),
        EventSpec(
            id: "weserubung_1940",
            scenarioIds: ["ww2_eve_1936", "ww2_europe_1939"],
            triggerYear: 1940, triggerMonth: 4, minDay: 185,
            title: "威瑟演习 · 闪击北欧",
            headline: "德军海空奇袭丹麦与挪威，抢占纳尔维克铁矿航道",
            dateLabel: "1940 年 4 月 9 日",
            body: "为确保瑞典铁矿经纳尔维克港源源不断运抵德国，德军出动海空力量闪电突袭丹麦与挪威。",
            effectSummary: "德国向丹麦王国与挪威王国宣战并获 90 日海空突击加成；挪威自动加入同盟国。",
            illustration: "event_weserubung_1940",
            actorSpecId: "germany", targetSpecId: "norway",
            choices: [
                Choice(title: "执行威瑟演习（史实）", subtitle: "突袭丹麦与挪威，夺取北海制海要冲", isHistorical: true, effectCode: "buff:germany:威瑟演习突击:22:0:1.22:20:90|war:germany:denmark:1|war:germany:norway:1|ally:uk:norway|tension:10"),
                Choice(title: "暂缓北欧战线、集中主力西进（架空）", subtitle: "跳过北欧直接备战西线", isHistorical: false, effectCode: "tension:2"),
            ]
        ),
        EventSpec(
            id: "churchill_pm_1940",
            scenarioIds: ["ww2_eve_1936", "ww2_europe_1939"],
            triggerYear: 1940, triggerMonth: 5, minDay: 215,
            title: "丘吉尔出任战时首相",
            headline: "「我能奉献的唯有热血、辛劳、眼泪与汗水！」",
            dateLabel: "1940 年 5 月 10 日",
            body: "挪威战役失利后张伯伦辞职，温斯顿·丘吉尔临危受命组建战时联合内阁，誓言绝不向纳粹德国屈服！",
            effectSummary: "大英帝国士气 +25、转入【战时经济】与【广泛征兵】，工业产能 +24。",
            illustration: "scroll_britain_1940",
            actorSpecId: "uk", targetSpecId: "germany",
            choices: [
                Choice(title: "热血与汗水 · 誓死抗战到底（史实）", subtitle: "英国全面转入总动员，本土士气空前高昂", isHistorical: true, effectCode: "morale:uk:25|ic:uk:24|law:uk:econ_war|law:uk:draft_extensive|buff:uk:决不投降誓言:14:24:1.05:15:240"),
            ]
        ),
        EventSpec(
            id: "fall_gelb_1940",
            scenarioIds: ["ww2_eve_1936", "ww2_europe_1939"],
            triggerYear: 1940, triggerMonth: 5, minDay: 225,
            title: "黄色方案 · 绕道低地三国闪击法国",
            headline: "阿登奇兵！古德里安装甲集群横扫荷比卢直插巴黎",
            dateLabel: "1940 年 5 月 10 日",
            body: "曼施坦因拟定大胆的「镰刀计划」：德军主力装甲集群突破被视为天堑的阿登森林，横扫荷兰、比利时、卢森堡低地三国，绕过马奇诺防线直逼英吉利海峡！",
            effectSummary: "德军激活 120 日【镰刀计划·阿登闪击】（行军 ×1.40、攻防突击 +36%），同时向荷兰、比利时、卢森堡宣战！",
            illustration: "event_fall_gelb_1940",
            actorSpecId: "germany", targetSpecId: "belgium",
            choices: [
                Choice(title: "发动黄色方案 · 绕道低地三国（史实）", subtitle: "全面进攻荷兰、比利时、卢森堡，包抄法军主力", isHistorical: true, effectCode: "buff:germany:镰刀计划·阿登闪击:36:0:1.40:0:120|war:germany:netherlands:1|war:germany:belgium:1|war:germany:luxembourg:1|ally:uk:netherlands|ally:uk:belgium|tension:18"),
                Choice(title: "正面强攻马奇诺防线（架空）", subtitle: "不侵犯低地三国中立，直接强攻法德边境", isHistorical: false, effectCode: "war:germany:france:1|tension:8"),
            ]
        ),
        EventSpec(
            id: "dunkirk_1940",
            scenarioIds: ["ww2_eve_1936", "ww2_europe_1939"],
            triggerYear: 1940, triggerMonth: 5, minDay: 245,
            title: "发电机行动 · 敦刻尔克大撤离",
            headline: "八百艘民船跨越炮火海峡，三十三万英法精锐绝处逢生",
            dateLabel: "1940 年 5 月 26 日",
            body: "德军装甲集群合围佛兰德斯之际，英国紧急征召数百艘民用渔船与驱逐舰实施「发电机行动」，奇迹般撤出三十三万八千名远征军火种。",
            effectSummary: "英国重整士气 +20、获国库 +320 与 120 日本土防卫加成。",
            illustration: "scroll_dunkirk_1940",
            actorSpecId: "uk", targetSpecId: "germany",
            choices: [
                Choice(title: "全力执行发电机行动撤回本土（史实）", subtitle: "保全远征军骨干力量，确保英国不倒", isHistorical: true, effectCode: "morale:uk:20|gold:uk:320|buff:uk:敦刻尔克精神:10:25:1.05:15:120"),
            ]
        ),
        EventSpec(
            id: "italy_joins_war_1940",
            scenarioIds: ["ww2_eve_1936", "ww2_europe_1939"],
            triggerYear: 1940, triggerMonth: 6, minDay: 260,
            title: "意大利宣战 · 地中海全面燃火",
            headline: "罗马向英法宣战，阿尔卑斯与北非战线同步打响",
            dateLabel: "1940 年 6 月 10 日",
            body: "眼见法国败局已定，墨索里尼迫不及待宣布向英法宣战，企图在阿尔卑斯山与地中海分享胜利果实，战火骤然蔓延至南欧与北非。",
            effectSummary: "意大利正式锁定轴心国并向法国与英国宣战；全球紧张度 +10。",
            illustration: "scroll_el_alamein_1942",
            actorSpecId: "italy", targetSpecId: "france",
            choices: [
                Choice(title: "意大利履行钢铁条约参战（史实）", subtitle: "对英法宣战，开辟地中海战区", isHistorical: true, effectCode: "ally:germany:italy|war:italy:france:1|war:italy:uk:1|law:italy:econ_war|tension:10"),
                Choice(title: "墨索里尼继续观望中立（架空）", subtitle: "意大利暂不出兵，避免过早耗尽海军", isHistorical: false, effectCode: "gold:italy:250|tension:-3"),
            ]
        ),
        EventSpec(
            id: "baltic_annexation_1940",
            scenarioIds: ["ww2_eve_1936", "ww2_europe_1939"],
            triggerYear: 1940, triggerMonth: 6, minDay: 272,
            title: "苏联接管波罗的海三国",
            headline: "莫斯科依据苏德密约进驻塔林、里加与维尔纽斯",
            dateLabel: "1940 年 6 月 15 日",
            body: "趁德军主力西线激战之机，苏联迅速向立陶宛、拉脱维亚、爱沙尼亚发出最后通牒，和平接管波罗的海沿岸防线，将苏联西方边界西推数百公里。",
            effectSummary: "苏联合并立陶宛、拉脱维亚、爱沙尼亚，工业产能 +22；全球紧张度 +10。",
            illustration: "event_poland_partition",
            actorSpecId: "ussr", targetSpecId: "lithuania",
            choices: [
                Choice(title: "红军进驻波罗的海三国（史实）", subtitle: "苏联和平并入波罗的海三国，构筑西方纵深", isHistorical: true, effectCode: "annex:ussr:lithuania|annex:ussr:latvia|annex:ussr:estonia|ic:ussr:22|tension:10"),
                Choice(title: "仅签署驻军附庸条约（架空）", subtitle: "三国成为苏联附庸保留名义自治", isHistorical: false, effectCode: "vassal:ussr:lithuania|vassal:ussr:latvia|vassal:ussr:estonia|tension:5"),
            ]
        ),
        EventSpec(
            id: "bessarabia_1940",
            scenarioIds: ["ww2_eve_1936", "ww2_europe_1939"],
            triggerYear: 1940, triggerMonth: 6, minDay: 285,
            title: "比萨拉比亚危机与第二次维也纳仲裁",
            headline: "罗马尼亚割让边境疆土，布加勒斯特倒向轴心国",
            dateLabel: "1940 年 6 月 28 日",
            body: "苏联发出最后通牒收回比萨拉比亚，随后德意主持第二次维也纳仲裁将北特兰西瓦尼亚划归匈牙利。罗马尼亚局势剧变，迅速倒向德国以保普洛耶什蒂油田。",
            effectSummary: "罗马尼亚割让东部边境给苏联并加入轴心国，德国获石油军需 +300。",
            illustration: "event_munich_1938",
            actorSpecId: "ussr", targetSpecId: "romania",
            choices: [
                Choice(title: "苏联收回比萨拉比亚·罗匈靠拢德国（史实）", subtitle: "东欧局势剧变，轴心掌控巴尔干石油", isHistorical: true, effectCode: "cede_east:romania:ussr:18|ally:germany:romania|ally:germany:hungary|gold:germany:300|tension:8"),
                Choice(title: "罗马尼亚武装拒割（架空）", subtitle: "苏罗在德涅斯特河爆发冲突", isHistorical: false, effectCode: "war:ussr:romania:0|tension:14"),
            ]
        ),
        EventSpec(
            id: "battle_of_britain_1940",
            scenarioIds: ["ww2_eve_1936", "ww2_europe_1939"],
            triggerYear: 1940, triggerMonth: 8, minDay: 315,
            title: "不列颠空战 · 鹰日折翼",
            headline: "「从未有如此众多的人，对如此少数的人欠下如此深重的情义！」",
            dateLabel: "1940 年 8 月 13 日",
            body: "戈林指挥德国空军发动「鹰日」大空袭企图夺取英吉利海峡制空权以实施海狮登陆；英国皇家空军依托雷达网与喷火战机浴血鏖战，终令德军渡海计划破产！",
            effectSummary: "英国激活 180 日【不列颠制空防御】（防御 +32%、海战 +25%），阻止德军渡海。",
            illustration: "scroll_britain_1940",
            actorSpecId: "uk", targetSpecId: "germany",
            choices: [
                Choice(title: "喷火战机迎击 · 守卫不列颠长空（史实）", subtitle: "皇家空军挫败海狮计划，保住反攻基地", isHistorical: true, effectCode: "buff:uk:不列颠空战胜利:14:32:1.05:25:180|morale:uk:20|law:uk:focus_radar_airdef"),
            ]
        ),
        EventSpec(
            id: "greco_italian_1940",
            scenarioIds: ["ww2_eve_1936", "ww2_europe_1939"],
            triggerYear: 1940, triggerMonth: 10, minDay: 365,
            title: "希意战争 · 品都斯山脉阻击战",
            headline: "希腊拒绝最后通牒喊出「不！」字，意军在山地陷入苦战",
            dateLabel: "1940 年 10 月 28 日",
            body: "意大利向希腊发出最后通牒遭梅塔克萨斯断然拒绝，意军自阿尔巴尼亚南攻却在险峻的品都斯山脉遭希腊军队顽强反推。",
            effectSummary: "意大利向希腊宣战，希腊加入同盟国并获 150 日【品都斯山地守备】防御加成。",
            illustration: "scroll_verdun_1916",
            actorSpecId: "italy", targetSpecId: "greece",
            choices: [
                Choice(title: "意军进攻希腊·巴尔干战火重燃（史实）", subtitle: "希腊加入同盟国并顽强反击", isHistorical: true, effectCode: "war:italy:greece:1|ally:uk:greece|buff:greece:品都斯山地反击:18:32:1.08:0:150|tension:8"),
                Choice(title: "意大利暂缓进攻希腊（架空）", subtitle: "巴尔干暂时保持脆弱和平", isHistorical: false, effectCode: "tension:-2"),
            ]
        ),
        EventSpec(
            id: "lend_lease_europe_1941",
            scenarioIds: ["ww2_eve_1936", "ww2_europe_1939"],
            triggerYear: 1941, triggerMonth: 3, minDay: 475,
            title: "美国《租借法案》签署 · 民主兵工厂启动",
            headline: "大西洋两岸物资洪流源源不断涌向伦敦与同盟国",
            dateLabel: "1941 年 3 月 11 日",
            body: "美国国会正式通过《租借法案》，海量坦克、战机、驱逐舰与战略燃油跨越北大西洋驶向大英帝国，极大缓解了同盟国的财政与工业重压。",
            effectSummary: "英国激活【租借法案】、工业产能 +35、国库 +600！",
            illustration: "scroll_dunkirk_1940",
            actorSpecId: "uk", targetSpecId: nil,
            choices: [
                Choice(title: "接收租借法案战略物资（史实）", subtitle: "英国工业、国库与海上补给大幅增强", isHistorical: true, effectCode: "ic:uk:35|gold:uk:600|law:uk:focus_lend_lease|morale:uk:12"),
            ]
        ),
        EventSpec(
            id: "balkan_campaign_1941",
            scenarioIds: ["ww2_eve_1936", "ww2_europe_1939"],
            triggerYear: 1941, triggerMonth: 4, minDay: 505,
            title: "玛莉塔行动 · 德军南下巴尔干",
            headline: "贝尔格莱德政变引发轴心雷霆南击，保加利亚加入轴心",
            dateLabel: "1941 年 4 月 6 日",
            body: "南斯拉夫爆发反轴心政变，柏林为解除东征苏联的南翼隐患并援救陷入希腊泥潭的意军，果断联合保加利亚与匈牙利闪击南斯拉夫与希腊！",
            effectSummary: "保加利亚加入轴心；德国、匈牙利对南斯拉夫与希腊宣战，德军获 75 日山地闪击加成。",
            illustration: "event_fall_gelb_1940",
            actorSpecId: "germany", targetSpecId: "yugoslavia",
            choices: [
                Choice(title: "发动巴尔干闪电战（史实）", subtitle: "迅速肃清巴尔干南翼，准备巴巴罗萨", isHistorical: true, effectCode: "ally:germany:bulgaria|war:germany:yugoslavia:1|war:germany:greece:1|war:hungary:yugoslavia:1|buff:germany:玛莉塔行动:24:0:1.25:0:75|tension:10"),
                Choice(title: "容忍南斯拉夫中立、提早攻苏（架空）", subtitle: "避免巴尔干拖延，为东线抢出五周黄金时间", isHistorical: false, effectCode: "buff:germany:提前东征整备:16:0:1.15:0:120"),
            ]
        ),
        EventSpec(
            id: "barbarossa_1941",
            scenarioIds: ["ww2_eve_1936", "ww2_europe_1939"],
            triggerYear: 1941, triggerMonth: 6, minDay: 560,
            title: "巴巴罗萨计划 · 苏德战争爆发",
            headline: "三百万轴心大军越过苏德边界，人类史上最惨烈陆战打响",
            dateLabel: "1941 年 6 月 22 日",
            body: "德意志撕毁互不侵犯条约，分北、中、南三个集团军群全线突击苏联，意大利、罗马尼亚、匈牙利、芬兰协同参战；斯大林号召伟大卫国战争全面总动员！",
            effectSummary: "德国与轴心盟友全面对苏宣战，德军获 150 日【巴巴罗萨初期突击】；苏联激活工业东迁与【卫国战争总动员】！",
            illustration: "event_barbarossa_1941",
            actorSpecId: "germany", targetSpecId: "ussr",
            choices: [
                Choice(title: "启动巴巴罗萨计划（史实）", subtitle: "全线突击苏联，触发史上最大规模陆战", isHistorical: true, effectCode: "buff:germany:巴巴罗萨突击:32:0:1.32:0:150|buff:ussr:伟大卫国战争:10:25:1.05:0:240|law:ussr:econ_total|law:ussr:draft_alladults|war:germany:ussr:1|war:italy:ussr:1|war:romania:ussr:1|war:hungary:ussr:1|war:finland:ussr:1|ally:uk:ussr|tension:25"),
                Choice(title: "维持苏德和平、全力执行海狮登陆（架空）", subtitle: "暂缓攻苏，集中力量渡海进攻英国", isHistorical: false, effectCode: "buff:germany:海狮渡海准备:18:0:1.15:32:150|tension:10"),
            ]
        ),
        EventSpec(
            id: "ural_evacuation_1941",
            scenarioIds: ["ww2_eve_1936", "ww2_europe_1939"],
            triggerYear: 1941, triggerMonth: 8, minDay: 615,
            title: "苏联军工大东迁 · 坦克城崛起",
            headline: "一千五百家大型兵工厂拆解东运乌拉尔，T-34 洪流日夜下线",
            dateLabel: "1941 年 8 月",
            body: "面对德军凌厉推进，苏联以惊人毅力将一千五百余家重工业工厂整体拆装运往乌拉尔与西伯利亚大后方，在荒原雪地上迅速重建起钢铁军工帝国！",
            effectSummary: "苏联工业产能 +45、国库 +500，前线兵员与坦克补给迅速恢复。",
            illustration: "scroll_stalingrad_1942",
            actorSpecId: "ussr", targetSpecId: "germany",
            choices: [
                Choice(title: "完成工业大东迁 · 量产 T-34（史实）", subtitle: "乌拉尔兵工厂爆发惊人产能", isHistorical: true, effectCode: "ic:ussr:45|gold:ussr:500|morale:ussr:14"),
            ]
        ),
        EventSpec(
            id: "moscow_winter_1941",
            scenarioIds: ["ww2_eve_1936", "ww2_europe_1939"],
            triggerYear: 1941, triggerMonth: 12, minDay: 720,
            title: "莫斯科保卫战 · 冬将军寒潮",
            headline: "零下四十度极寒降临！朱可夫挥师发动莫斯科冬季大反攻",
            dateLabel: "1941 年 12 月 5 日",
            body: "严酷的俄罗斯寒冬令缺乏冬装与防冻液的德军装甲部队寸步难行，朱可夫调动西伯利亚生力军在莫斯科城下发起排山倒海的冬季反攻！",
            effectSummary: "苏联获得 150 日【红军冬季大反攻】（攻击 +32%、防御 +28%、行军 ×1.20），工业产能 +35。",
            illustration: "event_moscow_winter",
            actorSpecId: "ussr", targetSpecId: "germany",
            choices: [
                Choice(title: "朱可夫发动莫斯科大反攻（史实）", subtitle: "西伯利亚精锐全线反击，粉碎德军闪电战神话", isHistorical: true, effectCode: "buff:ussr:莫斯科冬季反攻:32:28:1.20:0:150|ic:ussr:35|morale:ussr:22"),
                Choice(title: "固守伏尔加与莫斯科防线（架空）", subtitle: "积蓄重炮与坦克兵团等待春季总攻", isHistorical: false, effectCode: "buff:ussr:纵深筑垒:8:36:1.0:0:150|ic:ussr:25"),
            ]
        ),
        EventSpec(
            id: "case_blue_1942",
            scenarioIds: ["ww2_eve_1936", "ww2_europe_1939"],
            triggerYear: 1942, triggerMonth: 6, minDay: 900,
            title: "蓝色方案 · 德军南下高加索",
            headline: "南方集团军群直指顿河大弯曲部与高加索巴库油田",
            dateLabel: "1942 年 6 月 28 日",
            body: "为彻底解决轴心国战略石油危机，德军集中最后一批精锐装甲集群在乌克兰草原发动「蓝色方案」夏季总攻，兵锋直指斯大林格勒与高加索！",
            effectSummary: "德国获 120 日【蓝色方案夏季攻势】（攻击 +26%、行军 ×1.22），国库 +300。",
            illustration: "event_barbarossa_1941",
            actorSpecId: "germany", targetSpecId: "ussr",
            choices: [
                Choice(title: "集中装甲主力南下高加索与伏尔加（史实）", subtitle: "德军再度发起大规模夏季攻势", isHistorical: true, effectCode: "buff:germany:蓝色方案夏季攻势:26:0:1.22:0:120|gold:germany:300"),
            ]
        ),
        EventSpec(
            id: "el_alamein_1942",
            scenarioIds: ["ww2_eve_1936", "ww2_europe_1939"],
            triggerYear: 1942, triggerMonth: 10, minDay: 1020,
            title: "阿拉曼战役 · 北非沙海转折",
            headline: "蒙哥马利重炮轰开沙漠防线，隆美尔非洲军团全线西撤",
            dateLabel: "1942 年 10 月 23 日",
            body: "英国第八集团军在阿拉曼以绝对炮火与制空优势击败德意非洲军团，丘吉尔誉之为「开始的结束」，地中海战局彻底逆转。",
            effectSummary: "英国获 180 日【阿拉曼反攻】（攻击 +24%、海战 +20%）、国库 +380。",
            illustration: "scroll_el_alamein_1942",
            actorSpecId: "uk", targetSpecId: "italy",
            choices: [
                Choice(title: "蒙哥马利发动阿拉曼反攻（史实）", subtitle: "盟军重夺地中海与南欧战略主动权", isHistorical: true, effectCode: "buff:uk:阿拉曼胜利反攻:24:14:1.14:20:180|gold:uk:380|morale:uk:18"),
            ]
        ),
        EventSpec(
            id: "stalingrad_uranus_1942",
            scenarioIds: ["ww2_eve_1936", "ww2_europe_1939"],
            triggerYear: 1942, triggerMonth: 11, minDay: 1055,
            title: "斯大林格勒 · 天王星反包围行动",
            headline: "红军南北双钳合拢伏尔加！第六集团军陷入铁桶合围",
            dateLabel: "1942 年 11 月 19 日",
            body: "在废墟焦土中血战数月后，苏军发起惊天动地的「天王星行动」，从顿河与斯大林格勒南翼双路突破轴心侧翼，全歼并合围德军主力，二战迎来决定性转折！",
            effectSummary: "苏联获 180 日【天王星大合围】（攻击 +35%、防御 +24%、行军 ×1.20）、工业 +30。",
            illustration: "scroll_stalingrad_1942",
            actorSpecId: "ussr", targetSpecId: "germany",
            choices: [
                Choice(title: "发动天王星双钳合围（史实）", subtitle: "苏军彻底夺回东线战略主动权", isHistorical: true, effectCode: "buff:ussr:斯大林格勒·天王星反击:35:24:1.20:0:180|ic:ussr:30|morale:ussr:25"),
            ]
        ),
        EventSpec(
            id: "total_war_1943",
            scenarioIds: ["ww2_eve_1936", "ww2_europe_1939"],
            triggerYear: 1943, triggerMonth: 2, minDay: 1140,
            title: "德国宣布全面总体战",
            headline: "斯大林格勒惨败震撼柏林，施佩尔接管全国军工转入总体战",
            dateLabel: "1943 年 2 月 18 日",
            body: "德意志第三帝国被迫动员全部民用产能与预备役兵员，虎式与黑豹重型坦克加速走下生产线，企图在夏季东线扳回一城。",
            effectSummary: "德国切换【总体战动员】与【全民皆兵】，工业产能 +32、士气 +12。",
            illustration: "scroll_kursk_1943",
            actorSpecId: "germany", targetSpecId: "ussr",
            choices: [
                Choice(title: "启动全面总体战与重坦量产（史实）", subtitle: "德国军工达到战时最高峰", isHistorical: true, effectCode: "law:germany:econ_total|law:germany:draft_alladults|ic:germany:32|morale:germany:12"),
            ]
        ),
        EventSpec(
            id: "kursk_1943",
            scenarioIds: ["ww2_eve_1936", "ww2_europe_1939"],
            triggerYear: 1943, triggerMonth: 7, minDay: 1275,
            title: "库尔斯克大会战 · 史上最大坦克决战",
            headline: "普罗霍罗夫卡钢铁洪流对撞！虎豹重坦迎面撞上红军纵深防线",
            dateLabel: "1943 年 7 月 5 日",
            body: "数千辆坦克在库尔斯克突出部展开人类战争史上最壮烈的装甲大决战。苏军依托多道反坦克纵深防线顶住「堡垒行动」后，立刻转入全线战略大反攻！",
            effectSummary: "苏联获 180 日【库尔斯克大纵深反攻】（攻击 +30%、防御 +30%），德国装甲锐气受挫。",
            illustration: "scroll_kursk_1943",
            actorSpecId: "ussr", targetSpecId: "germany",
            choices: [
                Choice(title: "纵深消耗后全线装甲反击（史实）", subtitle: "苏军彻底粉碎德军东线最后一次战略进攻", isHistorical: true, effectCode: "buff:ussr:库尔斯克装甲反攻:30:30:1.18:0:180|morale:ussr:20"),
            ]
        ),
        EventSpec(
            id: "italy_armistice_1943",
            scenarioIds: ["ww2_eve_1936", "ww2_europe_1939"],
            triggerYear: 1943, triggerMonth: 9, minDay: 1335,
            title: "西西里登陆与意大利停战",
            headline: "盟军跨海攻入亚平宁半岛，墨索里尼倒台、罗马寻求停战",
            dateLabel: "1943 年 9 月 8 日",
            body: "英美盟军登陆西西里并进逼意大利本土，罗马爆发政变宣布停战；德军紧急南下接管意北防线，轴心同盟出现首道巨大裂痕。",
            effectSummary: "英国与盟军士气 +18、获南欧登陆加成；轴心南翼防线承压。",
            illustration: "scroll_normandy_1944",
            actorSpecId: "uk", targetSpecId: "italy",
            choices: [
                Choice(title: "盟军强攻亚平宁软肋（史实）", subtitle: "轴心南线动摇，盟军牵制大批德军", isHistorical: true, effectCode: "buff:uk:亚平宁两栖推进:22:12:1.15:25:150|morale:uk:18|morale:italy:-20"),
            ]
        ),
        EventSpec(
            id: "normandy_1944",
            scenarioIds: ["ww2_eve_1936", "ww2_europe_1939"],
            triggerYear: 1944, triggerMonth: 6, minDay: 1600,
            title: "霸王行动 · 诺曼底大登陆",
            headline: "史上最大规模两栖登陆！盟军开辟西欧第二战场",
            dateLabel: "1944 年 6 月 6 日",
            body: "数千艘舰船与万架战机蔽空而来，英美加联军冒着枪林弹雨强登诺曼底海滩，正式开辟欧洲第二战场，第三帝国陷入东西两线铁钳合围！",
            effectSummary: "英国与自由法国获 200 日【霸王行动·开辟第二战场】（攻击 +34%、海战 +30%、行军 ×1.25）、国库 +500。",
            illustration: "scroll_normandy_1944",
            actorSpecId: "uk", targetSpecId: "germany",
            choices: [
                Choice(title: "发动霸王行动 · 登陆诺曼底（史实）", subtitle: "开辟欧洲西线第二战场，直指莱茵河", isHistorical: true, effectCode: "buff:uk:霸王行动·诺曼底登陆:34:15:1.25:30:200|buff:france:自由法国解放本土:28:15:1.22:0:200|gold:uk:500|morale:uk:25"),
            ]
        ),
        EventSpec(
            id: "bagration_1944",
            scenarioIds: ["ww2_eve_1936", "ww2_europe_1939"],
            triggerYear: 1944, triggerMonth: 6, minDay: 1620,
            title: "巴格拉季昂行动 · 红军大纵深总攻",
            headline: "钢铁洪流横扫白俄罗斯！德军中央集团军群全线崩溃",
            dateLabel: "1944 年 6 月 22 日",
            body: "巴巴罗萨三周年之际，苏军集中四个方面军实施完美的大纵深机械化突击，一举粉碎德军中央集团军群，红军先头部队直抵维斯瓦河与东普鲁士边境！",
            effectSummary: "苏联获 200 日【巴格拉季昂·大纵深铁流】（攻击 +38%、行军 ×1.30），工业产能 +30。",
            illustration: "scroll_bagration_1944",
            actorSpecId: "ussr", targetSpecId: "germany",
            choices: [
                Choice(title: "启动巴格拉季昂大纵深攻势（史实）", subtitle: "红军摧枯拉朽横扫东线直逼柏林", isHistorical: true, effectCode: "buff:ussr:巴格拉季昂大纵深:38:16:1.30:0:200|ic:ussr:30|morale:ussr:25"),
            ]
        ),
        EventSpec(
            id: "berlin_1945",
            scenarioIds: ["ww2_eve_1936", "ww2_europe_1939"],
            triggerYear: 1945, triggerMonth: 4, minDay: 1900,
            title: "柏林战役 · 欧洲胜利日降临",
            headline: "红旗插上帝国大厦！反法西斯战争迎来最终总决战",
            dateLabel: "1945 年 4 月 16 日",
            body: "苏军强渡奥得河，英美盟军跨过莱茵河与易北河，东西两路反法西斯大军合围柏林，欧陆长达六年的浩劫终将画上句点！",
            effectSummary: "苏英法全线获得 180 日【柏林终局总攻】加成（攻击 +40%、士气 +30）。",
            illustration: "scroll_berlin_1945",
            actorSpecId: "ussr", targetSpecId: "germany",
            choices: [
                Choice(title: "总攻柏林 · 解放欧洲（史实）", subtitle: "东西联军齐头并进终结纳粹霸权", isHistorical: true, effectCode: "buff:ussr:柏林终局总攻:40:20:1.25:0:180|buff:uk:莱茵河大推进:34:18:1.22:0:180|morale:ussr:30|morale:uk:25"),
            ]
        ),

        // --- 额外真实外交与战区补强事件（中立国/土耳其/瑞典/瑞士） ---
        EventSpec(
            id: "swiss_redoubt_1940",
            scenarioIds: ["ww2_eve_1936", "ww2_europe_1939"],
            triggerYear: 1940, triggerMonth: 7, minDay: 300,
            title: "瑞士「阿尔卑斯国家堡垒」计划",
            headline: "吉桑将军下令全国总动员，阿尔卑斯雪峰化作铜墙铁壁",
            dateLabel: "1940 年 7 月 25 日",
            body: "西欧沦陷后瑞士陷入轴心四面合围，联邦总司令亨利·吉桑宣布将全部主力与物资撤入阿尔卑斯山隧道堡垒，令任何入侵者都将付出难以承受的代价。",
            effectSummary: "瑞士获得 360 日【阿尔卑斯国家堡垒】（防御 +45%、士气 +20）。",
            illustration: "scroll_verdun_1916",
            actorSpecId: "switzerland", targetSpecId: nil,
            choices: [
                Choice(title: "启动阿尔卑斯武装中立堡垒（史实）", subtitle: "以险峻雪山威慑一切入侵企图", isHistorical: true, effectCode: "buff:switzerland:阿尔卑斯国家堡垒:0:45:1.0:0:360|morale:switzerland:20"),
            ]
        ),
        EventSpec(
            id: "sweden_iron_ore_1940",
            scenarioIds: ["ww2_eve_1936", "ww2_europe_1939"],
            triggerYear: 1940, triggerMonth: 9, minDay: 340,
            title: "基律纳铁矿贸易博弈",
            headline: "瑞典在战火夹缝中出口优质铁矿石，国库暴富同时加紧扩军",
            dateLabel: "1940 年 9 月",
            body: "瑞典北方基律纳的高品位铁矿是欧洲军工命脉。斯德哥尔摩凭借灵活外交在保持中立的同时赚取巨额贸易盈余，并迅速扩建现代化陆军与博福斯高炮。",
            effectSummary: "瑞典国库 +420、工业产能 +14；德国获铁矿军工增产 +12。",
            illustration: "scroll_silkroad_peace",
            actorSpecId: "sweden", targetSpecId: "germany",
            choices: [
                Choice(title: "保持武装中立并维持铁矿贸易（史实）", subtitle: "瑞典繁荣自保，德国军工得续", isHistorical: true, effectCode: "gold:sweden:420|ic:sweden:14|ic:germany:12"),
                Choice(title: "全面禁运铁矿并靠拢同盟国（架空）", subtitle: "激怒柏林，北欧可能再度燃起战火", isHistorical: false, effectCode: "ally:uk:sweden|war:germany:sweden:1|tension:10"),
            ]
        ),
        EventSpec(
            id: "turkey_montreux_1941",
            scenarioIds: ["ww2_eve_1936", "ww2_europe_1939"],
            triggerYear: 1941, triggerMonth: 5, minDay: 530,
            title: "土耳其封锁黑海海峡 · 巧妙周旋两大阵营",
            headline: "伊纳尼恪守《蒙特勒公约》，安卡拉扼守欧亚咽喉",
            dateLabel: "1941 年 5 月",
            body: "当德军占领巴尔干、苏德大战一触即发之际，土耳其总统伊纳尼凭借老辣外交坚持武装中立，严密把控达达尼尔与博斯普鲁斯海峡。",
            effectSummary: "土耳其获得 240 日【海峡守备中立】防御加成（防御 +28%）、国库 +300。",
            illustration: "event_munich_1938",
            actorSpecId: "turkey", targetSpecId: nil,
            choices: [
                Choice(title: "严守海峡中立·左右逢源（史实）", subtitle: "保全安纳托利亚免于战火", isHistorical: true, effectCode: "buff:turkey:海峡武装中立:6:28:1.0:18:240|gold:turkey:300"),
            ]
        ),
        EventSpec(
            id: "romania_switch_1944",
            scenarioIds: ["ww2_eve_1936", "ww2_europe_1939"],
            triggerYear: 1944, triggerMonth: 8, minDay: 1680,
            title: "罗马尼亚八·二三倒戈",
            headline: "布加勒斯特倒向盟军，第三帝国痛失普洛耶什蒂油田",
            dateLabel: "1944 年 8 月 23 日",
            body: "苏军雅西—基什尼奥夫攻势席卷东欧之际，罗马尼亚宣布退出轴心阵营并对德宣战，德国装甲部队最后的天然石油供应彻底断绝！",
            effectSummary: "罗马尼亚与苏联停战并对德宣战；苏军获 120 日巴尔干推进加成。",
            illustration: "scroll_bagration_1944",
            actorSpecId: "romania", targetSpecId: "germany",
            choices: [
                Choice(title: "罗马尼亚阵前倒戈（史实）", subtitle: "巴尔干轴心崩盘，德军彻底断油", isHistorical: true, effectCode: "peace:romania:ussr|war:romania:germany:0|buff:ussr:巴尔干大捷:24:10:1.20:0:120"),
                Choice(title: "死守普洛耶什蒂油田（架空）", subtitle: "罗马尼亚继续为轴心苦战", isHistorical: false, effectCode: "buff:romania:死守喀尔巴阡:10:25:1.0:0:120"),
            ]
        ),
    ]

    // MARK: - 2. 1931 民国危局 · 九一八至十四年抗战事件链（18 条）

    private static let china1931Events: [EventSpec] = [
        EventSpec(
            id: "mukden_1931",
            scenarioIds: ["china_1931"],
            triggerYear: 1931, triggerMonth: 9, minDay: 5,
            title: "九一八事变 · 柳条湖危机",
            headline: "炮轰北大营！日本关东军悍然发动九一八事变",
            dateLabel: "1931 年 9 月 18 日",
            body: "日本关东军自行炸毁沈阳北郊柳条湖一段南满铁路并诬陷中国守军，随即连夜炮轰北大营、攻占沈阳，拉开中国人民十四年浴血抗战的序幕！",
            effectSummary: "大日本帝国携 120 日【关东军突袭】加成向东北军宣战；全球紧张度 +18。",
            illustration: "event_mukden_1931",
            actorSpecId: "japan", targetSpecId: "northeast",
            choices: [
                Choice(title: "关东军全面出击东北（史实）", subtitle: "日军突袭沈阳、长春，进逼松花江", isHistorical: true, effectCode: "buff:japan:关东军突袭:28:0:1.28:15:120|war:japan:northeast:1|tension:18"),
                Choice(title: "东北军就地全军死战抵抗（架空）", subtitle: "张学良下令全军誓死守土，全国援军驰援关外", isHistorical: false, effectCode: "buff:northeast:誓死守卫白山黑水:25:35:1.15:0:180|war:japan:northeast:1|war:roc:japan:1|tension:24"),
            ]
        ),
        EventSpec(
            id: "jiangqiao_1931",
            scenarioIds: ["china_1931"],
            triggerYear: 1931, triggerMonth: 11, minDay: 45,
            title: "江桥抗战 · 马占山打响有组织抗日第一枪",
            headline: "嫩江桥头血染冰雪，黑龙江守军奋起痛击日伪军",
            dateLabel: "1931 年 11 月 4 日",
            body: "黑龙江省代主席马占山违背不抵抗命令，在嫩江江桥率部奋起抗击关东军，激战半月毙伤日军千余人，极大鼓舞了全国抗日救亡热潮！",
            effectSummary: "东北军士气 +25、获 120 日【江桥血战】防御加成（防御 +28%）；全国抗战募捐国库 +260。",
            illustration: "event_mukden_1931",
            actorSpecId: "northeast", targetSpecId: "japan",
            choices: [
                Choice(title: "马占山誓死扼守嫩江桥（史实）", subtitle: "东北抗日义勇军士气大振", isHistorical: true, effectCode: "buff:northeast:江桥抗战义旗:14:28:1.05:0:120|morale:northeast:25|gold:roc:260"),
            ]
        ),
        EventSpec(
            id: "jan28_shanghai_1932",
            scenarioIds: ["china_1931"],
            triggerYear: 1932, triggerMonth: 1, minDay: 110,
            title: "一·二八淞沪抗战 · 十九路军血战闸北",
            headline: "蔡廷锴、蒋光鼐率第十九路军奋起抗敌，三易日军统帅！",
            dateLabel: "1932 年 1 月 28 日",
            body: "日本海军陆战队悍然进攻上海闸北，驻沪第十九路军与中央军第五军并肩浴血奋战月余，令日军三换司令，打破「日军不可战胜」神话！",
            effectSummary: "国民政府获 150 日【十九路军沪上血战】（防御 +24%、士气 +20），全球紧张度 +10。",
            illustration: "scroll_songhu_1937",
            actorSpecId: "roc", targetSpecId: "japan",
            choices: [
                Choice(title: "十九路军奋起保卫大上海（史实）", subtitle: "全国军民斗志昂扬，日军受挫止步", isHistorical: true, effectCode: "buff:roc:一二八沪上血战:15:24:1.0:0:150|morale:roc:20|tension:10"),
                Choice(title: "国民政府即刻对日全面宣战（架空）", subtitle: "全面抗战提前五年全面打响", isHistorical: false, effectCode: "war:roc:japan:1|buff:roc:提前全面抗战:18:24:1.05:0:180|tension:22"),
            ]
        ),
        EventSpec(
            id: "manchukuo_1932",
            scenarioIds: ["china_1931"],
            triggerYear: 1932, triggerMonth: 3, minDay: 145,
            title: "长春傀儡政权 · 伪满洲国建立",
            headline: "关东军在长春扶植溥仪成立伪满洲国",
            dateLabel: "1932 年 3 月 1 日",
            body: "日本关东军强占东北要冲后，在长春扶植废帝爱新觉罗·溥仪出任执政，企图将东北打造为继续鲸吞华北的战争工业基地。",
            effectSummary: "日本工业产能 +24，东北战线压力剧增，抗日义勇军在白山黑水遍地烽火；全球紧张度 +12。",
            illustration: "event_manchukuo_1932",
            actorSpecId: "japan", targetSpecId: "northeast",
            choices: [
                Choice(title: "扶植长春伪满傀儡政权（史实）", subtitle: "强化关东军北疆军工补给基地", isHistorical: true, effectCode: "ic:japan:24|gold:japan:300|tension:12"),
                Choice(title: "直接划为关东军军管直辖区（架空）", subtitle: "强化军事统治，引发更猛烈民众起义", isHistorical: false, effectCode: "ic:japan:16|tension:16"),
            ]
        ),
        EventSpec(
            id: "great_wall_1933",
            scenarioIds: ["china_1931"],
            triggerYear: 1933, triggerMonth: 3, minDay: 220,
            title: "长城抗战 · 喜峰口大刀队夜袭",
            headline: "「大刀向鬼子们的头上砍去！」第二十九军血战喜峰口",
            dateLabel: "1933 年 3 月 9 日",
            body: "日军占领热河后扑向长城各口，宋哲元第二十九军大刀队夜袭喜峰口重创日军，长城沿线将士以血肉之躯阻击现代机械化强敌！",
            effectSummary: "国民政府与东北军获 120 日【大刀队夜袭】攻防加成，士气 +18。",
            illustration: "event_marco_polo_1937",
            actorSpecId: "roc", targetSpecId: "japan",
            choices: [
                Choice(title: "长城各口死战御敌（史实）", subtitle: "大刀队威震全国，延缓日军入关", isHistorical: true, effectCode: "buff:roc:喜峰口大刀队:20:22:1.06:0:120|morale:roc:18|morale:northeast:16"),
            ]
        ),
        EventSpec(
            id: "long_march_1934",
            scenarioIds: ["china_1931"],
            triggerYear: 1934, triggerMonth: 10, minDay: 300,
            title: "红军战略大转移 · 二万五千里长征",
            headline: "四渡赤水、飞夺泸定桥，革命火种北上抗日前线！",
            dateLabel: "1934 年 10 月",
            body: "红军突破重围历经雪山草地二万五千里战略转移，遵义会议确立正确领导，主力胜利北上陕北直抵抗日最前线。",
            effectSummary: "苏区红军激活【持久战与敌后游击】、获 240 日【长征铁军】（防御 +32%、行军 ×1.25、士气 +28）。",
            illustration: "scroll_hundred_regiments",
            actorSpecId: "cpc", targetSpecId: "roc",
            choices: [
                Choice(title: "北上抗日 · 淬炼铁血红军（史实）", subtitle: "红军行军机动与顽强意志大幅跃升", isHistorical: true, effectCode: "law:cpc:focus_people_war|buff:cpc:长征铁军意志:22:32:1.25:0:240|morale:cpc:28"),
            ]
        ),
        EventSpec(
            id: "german_advisors_1935",
            scenarioIds: ["china_1931"],
            triggerYear: 1935, triggerMonth: 6, minDay: 350,
            title: "中德合作与德械调整师整编",
            headline: "法肯豪森顾问团协助整训中央军精锐，修筑吴福锡澄国防工事",
            dateLabel: "1935 年 6 月",
            body: "南京国民政府以钨矿换取德国军火并聘请德军顾问团整训教导总队、87师、88师等精锐德械调整师，同时加快粤汉铁路与兵工厂建设。",
            effectSummary: "国民政府工业产能 +22、获 180 日【德械整训师】战力加成（进攻 +16%、防御 +18%）。",
            illustration: "scroll_songhu_1937",
            actorSpecId: "roc", targetSpecId: nil,
            choices: [
                Choice(title: "整训德械调整师与兵工扩产（史实）", subtitle: "中央军精锐火力与防御显著增强", isHistorical: true, effectCode: "ic:roc:22|gold:roc:240|buff:roc:德械调整师:16:18:1.05:0:180"),
            ]
        ),
        EventSpec(
            id: "suiyuan_1936",
            scenarioIds: ["china_1931"],
            triggerYear: 1936, triggerMonth: 11, minDay: 395,
            title: "绥远抗战 · 百灵庙大捷",
            headline: "傅作义奇袭光复百灵庙，全国军民欢欣鼓舞",
            dateLabel: "1936 年 11 月 24 日",
            body: "晋绥军将领傅作义顶住压力，冒着塞外严寒奇袭日伪军盘踞的百灵庙一举全歼守敌，打响全面抗战前夕振奋人心的收复失地第一仗！",
            effectSummary: "晋绥军获 150 日【百灵庙奇袭】（进攻 +24%、防御 +24%）、士气 +25。",
            illustration: "event_mukden_1931",
            actorSpecId: "shanxi", targetSpecId: "japan",
            choices: [
                Choice(title: "傅作义寒夜奇袭收复百灵庙（史实）", subtitle: "晋绥防线士气如虹", isHistorical: true, effectCode: "buff:shanxi:百灵庙大捷:24:24:1.15:0:150|morale:shanxi:25|gold:shanxi:200"),
            ]
        ),
        EventSpec(
            id: "xian_incident_1936",
            scenarioIds: ["china_1931"],
            triggerYear: 1936, triggerMonth: 12, minDay: 420,
            title: "西安事变 · 停止内战一致抗日",
            headline: "兵谏华清池！国共内战基本结束，民族统一战线初成",
            dateLabel: "1936 年 12 月 12 日",
            body: "民族危机空前深重之际，张学良、杨虎城发动西安事变促成和平解决，十年内战基本结束，中国各派系开始酝酿全民族共同御侮。",
            effectSummary: "国民政府与红军停战并团结晋绥、新桂、川军、滇军、东北军形成抗日统一战线。",
            illustration: "event_xian_1936",
            actorSpecId: "roc", targetSpecId: "cpc",
            choices: [
                Choice(title: "和平解决西安事变、一致对外（史实）", subtitle: "停止内战，全民族凝聚抗日共识", isHistorical: true, effectCode: "peace:roc:cpc|ally:roc:cpc|ally:roc:northeast|ally:roc:shanxi|ally:roc:guangxi|ally:roc:sichuan|ally:roc:yunnan"),
                Choice(title: "继续内斗消耗（架空）", subtitle: "错失团结御侮良机，抗战局势雪上加霜", isHistorical: false, effectCode: "tension:8"),
            ]
        ),
        EventSpec(
            id: "marco_polo_1937",
            scenarioIds: ["china_1931"],
            triggerYear: 1937, triggerMonth: 7, minDay: 540,
            title: "七七卢沟桥事变 · 全民族抗战爆发",
            headline: "宛平城头枪声骤响！全民族抗日救亡全面打响",
            dateLabel: "1937 年 7 月 7 日",
            body: "日军借口士兵失踪悍然炮击宛平城与卢沟桥，中国守军第二十九军奋起还击。全国各党派军民正式结成抗日民族统一战线，誓死保卫河山！",
            effectSummary: "日本全面向中国各抗日阵营宣战；国共及川滇桂晋军团锁定【抗日民族统一战线】，激活持久抗战加成！",
            illustration: "event_marco_polo_1937",
            actorSpecId: "japan", targetSpecId: "roc",
            choices: [
                Choice(title: "全民族抗战 · 誓死御侮（史实）", subtitle: "抗日民族统一战线正式锁定，全国进入全面抗战", isHistorical: true, effectCode: "ally:roc:cpc|ally:roc:shanxi|ally:roc:guangxi|ally:roc:sichuan|ally:roc:yunnan|war:japan:roc:1|war:japan:cpc:1|law:roc:econ_war|law:roc:draft_extensive|buff:roc:淞沪与持久抗战:14:32:1.05:0:240|buff:cpc:敌后游击烽火:20:36:1.18:0:240|tension:25"),
                Choice(title: "华北局部妥协退让（架空）", subtitle: "割让华北换取短暂喘息，士气受挫", isHistorical: false, effectCode: "cede:roc:japan:15|tension:10"),
            ]
        ),
        EventSpec(
            id: "songhu_1937",
            scenarioIds: ["china_1931"],
            triggerYear: 1937, triggerMonth: 8, minDay: 575,
            title: "淞沪会战 · 八百壮士与血肉长城",
            headline: "七十万中国将士云集大上海，粉碎日军「三月亡华」狂言！",
            dateLabel: "1937 年 8 月 13 日",
            body: "淞沪会战打响，中央军精锐与川军、桂军、湘军、滇军源源不断开赴东海前线，浴血死战三个月，成功掩护沿江工业内迁大后方！",
            effectSummary: "国民政府工业内迁保底 +20、全军士气 +20；川滇桂各军士气同步高涨。",
            illustration: "scroll_songhu_1937",
            actorSpecId: "roc", targetSpecId: "japan",
            choices: [
                Choice(title: "寸土不让 · 掩护工业大内迁（史实）", subtitle: "粉碎三月亡华妄想，筑牢西南大后方", isHistorical: true, effectCode: "ic:roc:20|morale:roc:20|morale:sichuan:18|morale:guangxi:18|buff:roc:四行仓库壮志:12:28:1.0:0:150"),
            ]
        ),
        EventSpec(
            id: "pingxingguan_1937",
            scenarioIds: ["china_1931"],
            triggerYear: 1937, triggerMonth: 9, minDay: 605,
            title: "平型关大捷 · 打破日军不可战胜神话",
            headline: "八路军一一五师乔沟伏击坂垣师团，首创全民族抗战大捷！",
            dateLabel: "1937 年 9 月 25 日",
            body: "八路军东渡黄河开赴山西前线，协同晋绥军在平型关乔沟天险设伏痛歼日军精锐坂垣师团辎重与步兵千余人，全国上下振奋欢呼！",
            effectSummary: "红军/八路军与晋绥军获 150 日【平型关伏击战】（进攻 +28%、防御 +26%）。",
            illustration: "scroll_hundred_regiments",
            actorSpecId: "cpc", targetSpecId: "japan",
            choices: [
                Choice(title: "乔沟设伏 · 痛歼坂垣师团（史实）", subtitle: "八路军与晋绥军协同大捷", isHistorical: true, effectCode: "buff:cpc:平型关大捷:28:26:1.18:0:150|buff:shanxi:忻口太原协同:16:22:1.05:0:120|morale:cpc:25"),
            ]
        ),
        EventSpec(
            id: "taierzhuang_1938",
            scenarioIds: ["china_1931"],
            triggerYear: 1938, triggerMonth: 4, minDay: 720,
            title: "台儿庄大捷 · 运河古镇全歼矶谷板垣两翼",
            headline: "李宗仁指挥第五战区浴血巷战，歼敌万余震动中外！",
            dateLabel: "1938 年 4 月 7 日",
            body: "李宗仁率领桂军、川军、西北军与中央军各部精诚团结，在鲁南台儿庄运河古镇重创骄狂的日军矶谷、板垣两师团，取得抗战正面战场首次重大胜利！",
            effectSummary: "新桂系与国民政府获 180 日【台儿庄大捷】（进攻 +26%、防御 +24%）、国库 +300。",
            illustration: "scroll_taierzhuang_1938",
            actorSpecId: "guangxi", targetSpecId: "japan",
            choices: [
                Choice(title: "运河血战 · 合围歼灭日军精锐（史实）", subtitle: "打破日军不可战胜迷信，全国斗志沸腾", isHistorical: true, effectCode: "buff:guangxi:台儿庄大捷:28:24:1.15:0:180|buff:roc:徐州会战振奋:20:20:1.05:0:150|gold:roc:300|morale:guangxi:28"),
            ]
        ),
        EventSpec(
            id: "wuhan_soviet_aid_1938",
            scenarioIds: ["china_1931"],
            triggerYear: 1938, triggerMonth: 7, minDay: 790,
            title: "苏联援华航空志愿队与武汉保卫战",
            headline: "中苏西北大动脉打通，鹰击长空保卫华中重镇",
            dateLabel: "1938 年 7 月",
            body: "苏联向中国提供大批战机、火炮与低息军援，中苏航空志愿队在武汉上空屡创日机；中国军队以空间换时间，将日军彻底拖入持久战泥潭！",
            effectSummary: "国民政府获国库 +450、工业产能 +22，抗战步入战略相持阶段。",
            illustration: "scroll_changsha_1939",
            actorSpecId: "roc", targetSpecId: "ussr_fe",
            choices: [
                Choice(title: "接受苏联军援 · 坚持空间换时间（史实）", subtitle: "持久战格局彻底确立", isHistorical: true, effectCode: "gold:roc:450|ic:roc:22|buff:roc:武汉持久消耗:14:30:1.0:0:180"),
            ]
        ),
        EventSpec(
            id: "khalkhin_gol_1939",
            scenarioIds: ["china_1931"],
            triggerYear: 1939, triggerMonth: 8, minDay: 1020,
            title: "诺门罕战役 · 朱可夫装甲铁拳痛击关东军",
            headline: "哈拉哈河大草原坦克对决，日军「北进计划」彻底破产！",
            dateLabel: "1939 年 8 月 20 日",
            body: "日本关东军在中蒙边境挑起诺门罕冲突，朱可夫指挥苏蒙机械化装甲兵团实施教科书式双翼合围，彻底击溃日军第二十三师团，迫使东京放弃北进西伯利亚！",
            effectSummary: "苏联远东与外蒙古获 180 日【诺门罕装甲大捷】（进攻 +34%、行军 ×1.22）；日本北进受挫。",
            illustration: "event_august_storm_1945",
            actorSpecId: "ussr_fe", targetSpecId: "japan",
            choices: [
                Choice(title: "朱可夫双翼合围痛歼关东军（史实）", subtitle: "震慑东京，确保苏联远东后方稳固", isHistorical: true, effectCode: "buff:ussr_fe:诺门罕装甲大捷:34:20:1.22:0:180|buff:mongolia:苏蒙骑兵协同:22:22:1.18:0:180|morale:japan:-15"),
                Choice(title: "苏日全面扩大远东大战（架空）", subtitle: "苏蒙联军乘胜直驱东北与关东军全面开战", isHistorical: false, effectCode: "war:ussr_fe:japan:1|war:mongolia:japan:1|tension:20"),
            ]
        ),
        EventSpec(
            id: "changsha_1939_china31",
            scenarioIds: ["china_1931"],
            triggerYear: 1939, triggerMonth: 10, minDay: 1080,
            title: "第一次长沙会战 · 薛岳「天炉战法」",
            headline: "后退决战、四面合围，湘北战场再挫日军锐气！",
            dateLabel: "1939 年 10 月 6 日",
            body: "第九战区司令薛岳依托湘北水网丘陵创设「天炉战法」，诱敌深入而后四面合击，三战长沙皆重创日军，牢牢守住西南门户！",
            effectSummary: "国民政府获 180 日【天炉战法】（防御 +34%、进攻 +20%）、士气 +20。",
            illustration: "scroll_changsha_1939",
            actorSpecId: "roc", targetSpecId: "japan",
            choices: [
                Choice(title: "施展天炉战法 · 死守长沙（史实）", subtitle: "正面战场稳如磐石", isHistorical: true, effectCode: "buff:roc:长沙天炉战法:20:34:1.08:0:180|morale:roc:20"),
            ]
        ),
        EventSpec(
            id: "hundred_regiments_1940",
            scenarioIds: ["china_1931"],
            triggerYear: 1940, triggerMonth: 8, minDay: 1290,
            title: "百团大战 · 华北破袭风暴",
            headline: "彭德怀指挥一百零五个团全线出击，正太铁路化为火海！",
            dateLabel: "1940 年 8 月 20 日",
            body: "八路军在华北敌后突然发起规模空前的「百团大战」，一夜之间全面破袭正太、同蒲、平汉铁路与日军据点，彻底粉碎日军「囚笼政策」！",
            effectSummary: "红军/八路军获 180 日【百团破袭风暴】（进攻 +34%、行军 ×1.25）、士气 +25。",
            illustration: "scroll_hundred_regiments",
            actorSpecId: "cpc", targetSpecId: "japan",
            choices: [
                Choice(title: "一百零五团全线大破袭（史实）", subtitle: "华北日军交通线瘫痪，抗战信心倍增", isHistorical: true, effectCode: "buff:cpc:百团大战破袭:34:22:1.25:0:180|morale:cpc:25|morale:japan:-12"),
            ]
        ),
        EventSpec(
            id: "burma_road_1941",
            scenarioIds: ["china_1931"],
            triggerYear: 1941, triggerMonth: 3, minDay: 1440,
            title: "滇缅公路通车 · 西南抗战生命线",
            headline: "二十万云南民工徒手凿通横断山脉，国际援华物资滚滚而来！",
            dateLabel: "1941 年 3 月",
            body: "云南各族百姓以血汗筑成奇迹般的滇缅公路，经英属缅甸仰光港源源不断将战略物资与飞虎队装备送抵昆明与重庆！",
            effectSummary: "滇军与国民政府工业产能 +18、国库 +360，中英远东协作强化。",
            illustration: "scroll_changsha_1939",
            actorSpecId: "yunnan", targetSpecId: "uk_india",
            choices: [
                Choice(title: "全线贯通滇缅国际大动脉（史实）", subtitle: "西南大后方补给与工业显著增强", isHistorical: true, effectCode: "ic:roc:18|ic:yunnan:14|gold:roc:360|gold:yunnan:220|ally:roc:uk_india"),
            ]
        ),

        // MARK: - 3. 1941 二战亚洲太平洋战场（18 条 HOI4 级太平洋与抗战事件链）

        EventSpec(
            id: "pearl_harbor_1941",
            scenarioIds: ["ww2_asia_1941"],
            triggerYear: 1941, triggerMonth: 12, minDay: 4,
            title: "偷袭珍珠港 · 虎！虎！虎！",
            headline: "联合舰队奇袭夏威夷与南洋！太平洋战争全面爆发",
            dateLabel: "1941 年 12 月 7 日",
            body: "山本五十六统筹的六艘航空母舰特混编队发来「虎！虎！虎！」奇袭密电，日军同时扑向珍珠港、菲律宾、香港、马来亚、新加坡与荷属东印度油田！",
            effectSummary: "大日本帝国获得 150 日【虎！虎！虎！海空奇袭】（海战 +35%、突击 +28%、行军 ×1.25），向美、英、荷、菲全面宣战！",
            illustration: "event_pearl_harbor_1941",
            actorSpecId: "japan", targetSpecId: "usa_pacific",
            choices: [
                Choice(title: "执行南进战略 · 偷袭珍珠港（史实）", subtitle: "联合舰队全线南下，夺取东南亚石油橡胶", isHistorical: true, effectCode: "buff:japan:虎！虎！虎！海空奇袭:28:0:1.25:35:150|war:japan:usa_pacific:1|war:japan:philippines:1|war:japan:uk_burma:1|war:japan:uk_malaya:1|war:japan:dutch_ei:1|tension:30"),
                Choice(title: "放弃南进 · 转向北进突击苏联远东（架空）", subtitle: "联合关东军北上西伯利亚，暂不惹怒美国", isHistorical: false, effectCode: "buff:japan:关东军北进突击:26:0:1.22:10:150|war:japan:ussr_fe:1|war:japan:mongolia:1|tension:22"),
            ]
        ),
        EventSpec(
            id: "hong_kong_1941",
            scenarioIds: ["ww2_asia_1941"],
            triggerYear: 1941, triggerMonth: 12, minDay: 18,
            title: "香港保卫战与马六甲海战",
            headline: "威尔士亲王号折戟南海，日军银轮部队席卷马来半岛",
            dateLabel: "1941 年 12 月 18 日",
            body: "日军陆攻机在关丹外海击沉英国「威尔士亲王号」与「反击号」，制海权骤然易手，山下奉文指挥马来方面军沿热带雨林昼夜南突！",
            effectSummary: "日本获 90 日【马来银轮南进】加成，泰国与日本缔结军事协定；全球紧张度 +8。",
            illustration: "scroll_singapore_1942",
            actorSpecId: "japan", targetSpecId: "uk_malaya",
            choices: [
                Choice(title: "泰国借道 · 日军闪击马来与香港（史实）", subtitle: "轴心掌控南海与马来半岛主动权", isHistorical: true, effectCode: "ally:japan:thailand|buff:japan:银轮闪击南洋:20:0:1.22:20:90|tension:8"),
            ]
        ),
        EventSpec(
            id: "third_changsha_1942",
            scenarioIds: ["ww2_asia_1941"],
            triggerYear: 1942, triggerMonth: 1, minDay: 35,
            title: "第三次长沙大捷 · 盟军太平洋开局首胜",
            headline: "珍珠港阴霾下的曙光！中国军队在湘北全线击退日军",
            dateLabel: "1942 年 1 月 15 日",
            body: "当欧美盟军在东南亚节节败退之际，中国第九战区于长沙城下以「天炉战法」重创日军第十一军，成为太平洋战争爆发后反法西斯同盟的第一场陆战大捷！",
            effectSummary: "国民政府获 180 日【第三次长沙大捷】（防御 +30%、进攻 +22%）、士气 +24、国库 +350！",
            illustration: "scroll_changsha_1939",
            actorSpecId: "roc", targetSpecId: "japan",
            choices: [
                Choice(title: "湘北大捷 · 振奋全球盟军（史实）", subtitle: "中国正面战场稳如磐石，赢得国际赞誉", isHistorical: true, effectCode: "buff:roc:第三次长沙大捷:22:30:1.10:0:180|morale:roc:24|gold:roc:350"),
            ]
        ),
        EventSpec(
            id: "singapore_fall_1942",
            scenarioIds: ["ww2_asia_1941"],
            triggerYear: 1942, triggerMonth: 2, minDay: 70,
            title: "新加坡要塞激战与南洋石油夺取",
            headline: "直布罗陀东方要塞告急，日军伞兵空降巨港油田",
            dateLabel: "1942 年 2 月 15 日",
            body: "日军横渡柔佛海峡强攻新加坡并空降苏门答腊巴邻旁油田，企图在六个月内彻底囊括东南亚的石油、橡胶与锡矿资源。",
            effectSummary: "日本工业产能 +26、国库 +400；英属马来与荷属东印度进入背水一战。",
            illustration: "scroll_singapore_1942",
            actorSpecId: "japan", targetSpecId: "dutch_ei",
            choices: [
                Choice(title: "夺取南洋战略资源区（史实）", subtitle: "日本战时燃油与军工短暂缓解", isHistorical: true, effectCode: "ic:japan:26|gold:japan:400|buff:dutch_ei:焦土炸毁油井:8:22:1.0:10:120"),
            ]
        ),
        EventSpec(
            id: "flying_tigers_hump_1942",
            scenarioIds: ["ww2_asia_1941"],
            triggerYear: 1942, triggerMonth: 4, minDay: 120,
            title: "飞虎队翱翔西南 · 驼峰航线启航",
            headline: "陈纳德鲨鱼嘴战机痛击日机，中美开辟喜马拉雅空中生命线",
            dateLabel: "1942 年 4 月 8 日",
            body: "滇缅公路受阻后，中美空军毅然跨越海拔五千米的喜马拉雅「驼峰航线」向昆明、重庆昼夜空运军火燃油，飞虎队在西南长空屡建奇功！",
            effectSummary: "国民政府工业产能 +26、国库 +420、获 180 日【飞虎队制空支援】。",
            illustration: "scroll_britain_1940",
            actorSpecId: "roc", targetSpecId: "usa_pacific",
            choices: [
                Choice(title: "开通驼峰航线 · 飞虎队护航（史实）", subtitle: "中国大后方战略补给源源不断", isHistorical: true, effectCode: "ic:roc:26|gold:roc:420|buff:roc:飞虎队与驼峰航线:18:18:1.08:0:180"),
            ]
        ),
        EventSpec(
            id: "doolittle_raid_1942",
            scenarioIds: ["ww2_asia_1941"],
            triggerYear: 1942, triggerMonth: 4, minDay: 135,
            title: "杜立特空袭东京 · 震动日本大本营",
            headline: "B-25 轰炸机自大黄蜂号航母起飞奇袭东京，迫使日军孤注一掷",
            dateLabel: "1942 年 4 月 18 日",
            body: "美军十六架中型轰炸机破天荒从航空母舰起飞轰炸东京、横滨与名古屋后飞抵中国浙江降落，极大震慑东京大本营并促使其仓促发动中途岛决战。",
            effectSummary: "美军太平洋舰队士气 +25、获 120 日奇袭加成；日本被迫提前消耗航母主力。",
            illustration: "event_pearl_harbor_1941",
            actorSpecId: "usa_pacific", targetSpecId: "japan",
            choices: [
                Choice(title: "实施杜立特东京空袭（史实）", subtitle: "极大振奋盟军士气，打乱日本战略节奏", isHistorical: true, effectCode: "morale:usa_pacific:25|buff:usa_pacific:杜立特奇袭士气:18:10:1.12:22:120|morale:japan:-10"),
            ]
        ),
        EventSpec(
            id: "coral_sea_1942",
            scenarioIds: ["ww2_asia_1941"],
            triggerYear: 1942, triggerMonth: 5, minDay: 155,
            title: "珊瑚海海战 · 人类首次航母超视距决战",
            headline: "舰载机群跨越数百海里对攻，挫败日军登陆莫尔兹比港企图",
            dateLabel: "1942 年 5 月 7 日",
            body: "美澳联合特混舰队在珊瑚海截击日军南下巴布亚的登陆编队，双方军舰全程未见一面全凭舰载机生死相搏，成功守住西南太平洋桥头堡！",
            effectSummary: "美军太平洋舰队获 120 日【珊瑚海防卫】（海战 +24%、防御 +24%）。",
            illustration: "event_midway_1942",
            actorSpecId: "usa_pacific", targetSpecId: "japan",
            choices: [
                Choice(title: "截击日军登陆编队 · 守住巴布亚（史实）", subtitle: "阻断日军南进澳新航道", isHistorical: true, effectCode: "buff:usa_pacific:珊瑚海航母决战:16:24:1.05:24:120|morale:usa_pacific:16"),
            ]
        ),
        EventSpec(
            id: "midway_1942",
            scenarioIds: ["ww2_asia_1941"],
            triggerYear: 1942, triggerMonth: 6, minDay: 185,
            title: "中途岛海战 · 太平洋战局转折",
            headline: "尼米兹破译密电奇袭机动部队！联合舰队四大航母葬身海底",
            dateLabel: "1942 年 6 月 4 日",
            body: "美国太平洋舰队破译日军「AF」密码在中途岛伏击重创联合舰队航母主力，同时美国战时工业产能全面爆发，盟军在太平洋与印缅战区展开战略反攻！",
            effectSummary: "美军太平洋舰队工业产能 +65 并获 240 日【跳岛海空反攻】（海战 +36%、攻防 +26%），中国战区获强力补给！",
            illustration: "event_midway_1942",
            actorSpecId: "usa_pacific", targetSpecId: "japan",
            choices: [
                Choice(title: "发起太平洋跳岛大反攻（史实）", subtitle: "美军航母产能暴涨，全面压制联合舰队", isHistorical: true, effectCode: "ic:usa_pacific:65|gold:usa_pacific:600|law:usa_pacific:focus_carrier_fleet|buff:usa_pacific:太平洋海空大反攻:26:16:1.22:36:240|buff:roc:驼峰航线与远征反攻:18:16:1.08:0:180|morale:japan:-18"),
                Choice(title: "稳健固守西南太平洋防线（架空）", subtitle: "优先积蓄两栖与航母舰队力量", isHistorical: false, effectCode: "ic:usa_pacific:45|buff:usa_pacific:重工爆舰:12:24:1.05:28:200"),
            ]
        ),
        EventSpec(
            id: "guadalcanal_1942",
            scenarioIds: ["ww2_asia_1941"],
            triggerYear: 1942, triggerMonth: 8, minDay: 245,
            title: "瓜达尔卡纳尔岛绞肉机",
            headline: "陆战队强登亨德森机场，半年血战耗尽日本海军航空精锐",
            dateLabel: "1942 年 8 月 7 日",
            body: "美军发起首次大型两栖反攻直插所罗门群岛，日美双方在酷热丛林与铁底湾展开长达半年的立体拉锯战，日本精锐飞行员消耗殆尽。",
            effectSummary: "美军太平洋舰队获 150 日【两栖跳岛突击】（进攻 +24%、海战 +24%），士气 +18。",
            illustration: "scroll_leyte_1944",
            actorSpecId: "usa_pacific", targetSpecId: "japan",
            choices: [
                Choice(title: "血战铁底湾 · 夺取所罗门制空权（史实）", subtitle: "美军彻底转入战略反攻", isHistorical: true, effectCode: "buff:usa_pacific:瓜岛两栖反攻:24:14:1.15:24:150|morale:usa_pacific:18"),
            ]
        ),
        EventSpec(
            id: "yanan_production_1942",
            scenarioIds: ["ww2_asia_1941"],
            triggerYear: 1942, triggerMonth: 10, minDay: 300,
            title: "延安大生产运动与地道战地雷战",
            headline: "自己动手丰衣足食！华北敌后军民粉碎日军残酷「扫荡」",
            dateLabel: "1942 年 10 月",
            body: "面对封锁与扫荡，延安抗日根据地掀起轰轰烈烈的大生产运动，华北平原与太行山区广泛开展地道战、地雷战与麻雀战，将数十万日伪军死死拖在敌后！",
            effectSummary: "延安抗日根据地工业产能 +24、国库 +320，获 240 日【敌后人民战争】（防御 +38%、进攻 +20%）。",
            illustration: "scroll_hundred_regiments",
            actorSpecId: "yanan", targetSpecId: "japan",
            choices: [
                Choice(title: "大生产自救 · 敌后游击反扫荡（史实）", subtitle: "延安根据地越战越强，牢牢牵制华北日军", isHistorical: true, effectCode: "ic:yanan:24|gold:yanan:320|law:yanan:focus_people_war|buff:yanan:敌后反扫荡游击:20:38:1.20:0:240|morale:yanan:24"),
            ]
        ),
        EventSpec(
            id: "chinese_expedition_burma_1943",
            scenarioIds: ["ww2_asia_1941"],
            triggerYear: 1943, triggerMonth: 10, minDay: 640,
            title: "中国驻印军与远征军大反攻缅北",
            headline: "新一军、新六军换装美械坦克重炮，血战胡康河谷与密支那！",
            dateLabel: "1943 年 10 月 24 日",
            body: "孙立人、廖耀湘率领在印度兰姆伽完成全美械整训的中国驻印军杀回缅北，与滇西中国远征军东西对进，攻克密支那与松山，重新打通中印公路！",
            effectSummary: "国民政府与英属印缅获 180 日【缅北滇西反攻】（进攻 +28%、行军 ×1.18）、国库 +400。",
            illustration: "scroll_taierzhuang_1938",
            actorSpecId: "roc", targetSpecId: "japan",
            choices: [
                Choice(title: "东西对进 · 打通史迪威公路（史实）", subtitle: "精锐美械师横扫缅北日军", isHistorical: true, effectCode: "buff:roc:远征军缅北大反攻:28:18:1.18:0:180|buff:uk_burma:英帕尔缅北协同:24:22:1.12:0:180|gold:roc:400"),
            ]
        ),
        EventSpec(
            id: "imphal_kohima_1944",
            scenarioIds: ["ww2_asia_1941"],
            triggerYear: 1944, triggerMonth: 3, minDay: 790,
            title: "英帕尔与科希马大血战",
            headline: "日军「乌号作战」在季风雨林崩溃，英印第十四集团军反守为攻",
            dateLabel: "1944 年 3 月 8 日",
            body: "日军妄图孤注一掷翻越印缅山地夺取英帕尔，结果在斯利姆指挥的英印军空投补给防线前粮尽弹绝、惨败而归，缅甸战局彻底逆转！",
            effectSummary: "英属印度与缅甸获 180 日【英帕尔大捷】（防御 +32%、进攻 +26%）、工业产能 +22。",
            illustration: "scroll_singapore_1942",
            actorSpecId: "uk_burma", targetSpecId: "japan",
            choices: [
                Choice(title: "空投固守英帕尔 · 追击崩溃日军（史实）", subtitle: "彻底扭转东南亚陆战态势", isHistorical: true, effectCode: "buff:uk_burma:英帕尔大捷反攻:26:32:1.15:0:180|ic:uk_burma:22|morale:uk_burma:24"),
            ]
        ),
        EventSpec(
            id: "ichi_go_1944",
            scenarioIds: ["ww2_asia_1941"],
            triggerYear: 1944, triggerMonth: 4, minDay: 825,
            title: "一号作战 · 豫湘桂会战与衡阳四十七日血战",
            headline: "日军集结五十万最后机动兵力打通大陆交通线，方先觉孤军血战衡阳",
            dateLabel: "1944 年 4 月 17 日",
            body: "海运几近瘫痪的日本倾尽中国派遣军最后兵力发起「一号作战」；中国第十军在衡阳城下死守四十七天震撼敌胆，延安敌后主力乘机在华北展开大规模反攻！",
            effectSummary: "日本获 90 日【一号作战孤注一掷】，但延安与重庆激活反攻韧性。",
            illustration: "scroll_changsha_1939",
            actorSpecId: "japan", targetSpecId: "roc",
            choices: [
                Choice(title: "发动一号作战 · 孤注一掷打通华南（史实）", subtitle: "日军回光返照，敌后战线愈发空虚", isHistorical: true, effectCode: "buff:japan:一号作战强攻:22:0:1.15:0:90|buff:roc:衡阳四十七日血战:12:30:1.0:0:150|buff:yanan:华北局部大反攻:26:20:1.18:0:180"),
            ]
        ),
        EventSpec(
            id: "philippine_sea_1944",
            scenarioIds: ["ww2_asia_1941"],
            triggerYear: 1944, triggerMonth: 6, minDay: 890,
            title: "马里亚纳海空大决战",
            headline: "「马里亚纳猎火鸡」！日本海军航空兵彻底覆灭，B-29 进驻塞班",
            dateLabel: "1944 年 6 月 19 日",
            body: "美军埃塞克斯级航母编队在菲律宾海一战击落数百架日机，迅速攻占塞班岛与关岛，日本本土全境从此暴露在 B-29 超级空中堡垒航程之下！",
            effectSummary: "美军太平洋舰队工业产能 +45、获 180 日【马里亚纳制空制海】（海战 +40%、进攻 +28%）。",
            illustration: "event_midway_1942",
            actorSpecId: "usa_pacific", targetSpecId: "japan",
            choices: [
                Choice(title: "彻底歼灭日军航母舰载机群（史实）", subtitle: "西太平洋海空控制权完全易手", isHistorical: true, effectCode: "ic:usa_pacific:45|buff:usa_pacific:马里亚纳制空霸权:28:18:1.20:40:180|morale:japan:-20"),
            ]
        ),
        EventSpec(
            id: "leyte_gulf_1944",
            scenarioIds: ["ww2_asia_1941"],
            triggerYear: 1944, triggerMonth: 10, minDay: 1010,
            title: "莱特湾海战 · 麦克阿瑟重返菲律宾",
            headline: "人类史上最大规模海战！武藏号沉没，联合舰队从此丧失作战能力",
            dateLabel: "1944 年 10 月 23 日",
            body: "麦克阿瑟涉水登岸莱特岛宣告「我回来了」，日军孤注一掷发动「捷一号作战」，却在苏里高海峡与萨马岛外海遭美军压倒性火力摧毁，巨舰时代终结！",
            effectSummary: "美军太平洋舰队与菲律宾获 180 日【重返吕宋】（海战 +42%、进攻 +34%）。",
            illustration: "scroll_leyte_1944",
            actorSpecId: "usa_pacific", targetSpecId: "japan",
            choices: [
                Choice(title: "决战莱特湾 · 解放菲律宾（史实）", subtitle: "联合舰队彻底瓦解，日本海运断绝", isHistorical: true, effectCode: "buff:usa_pacific:莱特湾决胜:34:16:1.24:42:180|buff:philippines:菲律宾游击光复:24:22:1.15:0:180|morale:usa_pacific:25"),
            ]
        ),
        EventSpec(
            id: "iwo_okinawa_1945",
            scenarioIds: ["ww2_asia_1941"],
            triggerYear: 1945, triggerMonth: 4, minDay: 1180,
            title: "硫磺岛与冲绳岛血战 · 本土决战前夜",
            headline: "星条旗插上折钵山，大和号特攻沉没，日本海上锁链彻底收紧",
            dateLabel: "1945 年 4 月 1 日",
            body: "盟军攻入琉球门户，战列舰大和号在冲绳外海遭数百架舰载机击沉。中国正面战场亦在湘西雪峰山取得完胜，反法西斯胜利在望！",
            effectSummary: "美、中两军获 150 日【湘西与冲绳决胜】总攻加成。",
            illustration: "scroll_leyte_1944",
            actorSpecId: "usa_pacific", targetSpecId: "japan",
            choices: [
                Choice(title: "攻克冲绳门户 · 湘西雪峰山大捷（史实）", subtitle: "盟军兵临日本本土与华南门户", isHistorical: true, effectCode: "buff:usa_pacific:冲绳海空压制:34:16:1.20:38:150|buff:roc:湘西雪峰山大捷:28:22:1.15:0:150"),
            ]
        ),
        EventSpec(
            id: "august_storm_1945",
            scenarioIds: ["ww2_asia_1941"],
            triggerYear: 1945, triggerMonth: 8, minDay: 1290,
            title: "八月风暴 · 苏联远东对日宣战",
            headline: "华西列夫斯基挥师百万红军突击关东军，解放东北全境",
            dateLabel: "1945 年 8 月 8 日",
            body: "苏联履行《雅尔塔协定》正式对日宣战，一百五十万远东红军与蒙古骑兵装甲集群越过黑龙江与兴安岭，对伪满洲国与关东军展开钢铁洪流式合围！",
            effectSummary: "苏联远东与外蒙古获 150 日【八月风暴装甲洪流】加成，全面对大日本帝国与伪满洲国宣战！",
            illustration: "event_august_storm_1945",
            actorSpecId: "ussr_fe", targetSpecId: "japan",
            choices: [
                Choice(title: "发动八月风暴 · 解放东北（史实）", subtitle: "红军钢铁洪流突袭关东军与伪满洲国", isHistorical: true, effectCode: "buff:ussr_fe:八月风暴钢铁洪流:40:16:1.35:0:150|buff:mongolia:苏蒙越兴安岭:28:14:1.28:0:150|war:ussr_fe:japan:1|war:ussr_fe:manchukuo:1|war:mongolia:manchukuo:1|tension:15"),
                Choice(title: "维持苏日中立条约（架空）", subtitle: "苏联暂不介入远东战事", isHistorical: false, effectCode: "tension:-5"),
            ]
        ),
        EventSpec(
            id: "china_grand_counteroffensive_1945",
            scenarioIds: ["ww2_asia_1941"],
            triggerYear: 1945, triggerMonth: 8, minDay: 1305,
            title: "全中国抗日大反攻 · 凯歌奏响神州",
            headline: "正面与敌后抗日武装全线反攻，十四年浴血抗战迎来伟大胜利！",
            dateLabel: "1945 年 8 月 15 日",
            body: "面对盟军全面反攻与中国人民十四年不屈抗争，日本法西斯已山穷水尽。中华儿女全面收复大江南北与沦陷故土！",
            effectSummary: "国民政府与延安均获 180 日【光复河山大反攻】（进攻 +38%、士气 +30）。",
            illustration: "scroll_berlin_1945",
            actorSpecId: "roc", targetSpecId: "japan",
            choices: [
                Choice(title: "全线大反攻 · 光复锦绣河山（史实）", subtitle: "十四年血战终迎胜利曙光", isHistorical: true, effectCode: "buff:roc:抗战胜利大反攻:38:20:1.25:0:180|buff:yanan:大反攻收复失地:38:22:1.28:0:180|morale:roc:30|morale:yanan:30"),
            ]
        ),
    ]

    // MARK: - 4. 1914 第一次世界大战 · 欧陆炮火（16 条）

    private static let ww1Events: [EventSpec] = [
        EventSpec(
            id: "schlieffen_1914",
            scenarioIds: ["ww1_1914"],
            triggerYear: 1914, triggerMonth: 8, minDay: 5,
            title: "施里芬计划 · 德军强渡比利时",
            headline: "欧洲灯火熄灭！德军借道比利时直扑巴黎，英国参战",
            dateLabel: "1914 年 8 月 4 日",
            body: "德意志帝国按施里芬计划绕道比利时包抄法军左翼，大英帝国立即以维护比利时中立为由对德宣战，第一次世界大战全面引爆！",
            effectSummary: "德国获 100 日【施里芬西线突击】向法比宣战，大英帝国正式加入协约国对德奥宣战。",
            illustration: "event_schlieffen_1914",
            actorSpecId: "germany", targetSpecId: "france",
            choices: [
                Choice(title: "执行施里芬计划（史实）", subtitle: "借道比利时包抄巴黎，大英帝国参战", isHistorical: true, effectCode: "buff:germany:施里芬突击:26:0:1.25:0:100|war:germany:belgium:1|war:germany:france:1|war:britain:germany:1|tension:28"),
                Choice(title: "改行东进战略 · 先击溃沙俄（架空）", subtitle: "西线防御、东线全力重锤俄罗斯帝国", isHistorical: false, effectCode: "buff:germany:坦能堡东线突击:28:12:1.20:0:120|war:germany:russia:1|tension:20"),
            ]
        ),
        EventSpec(
            id: "tannenberg_1914",
            scenarioIds: ["ww1_1914"],
            triggerYear: 1914, triggerMonth: 8, minDay: 24,
            title: "坦能堡会战 · 兴登堡与鲁登道夫歼灭战",
            headline: "德军巧用铁路内线机动，在东普鲁士全歼俄国第二集团军！",
            dateLabel: "1914 年 8 月 26 日",
            body: "沙俄火速攻入东普鲁士以解巴黎之围，兴登堡与鲁登道夫大胆南调主力截获俄军明码电报，在马祖里湖泊间打出一场教科书级的合围歼灭战。",
            effectSummary: "德国获 120 日【坦能堡内线机动】（进攻 +24%、防御 +18%）、士气 +18。",
            illustration: "scroll_tannenberg_1914",
            actorSpecId: "germany", targetSpecId: "russia",
            choices: [
                Choice(title: "铁路内线合围 · 决胜坦能堡（史实）", subtitle: "东普鲁士防线转危为安", isHistorical: true, effectCode: "buff:germany:坦能堡合围:24:18:1.15:0:120|morale:germany:18|morale:russia:-12"),
            ]
        ),
        EventSpec(
            id: "marne_1914",
            scenarioIds: ["ww1_1914"],
            triggerYear: 1914, triggerMonth: 9, minDay: 40,
            title: "马恩河奇迹 · 巴黎出租车急送援军",
            headline: "霞飞元帅下令全线反攻！德军速胜梦碎，西线转入漫长堑壕战",
            dateLabel: "1914 年 9 月 6 日",
            body: "德军逼近巴黎城郊之际，法军紧急征调六百辆巴黎出租车昼夜抢运预备队杀入德军缺口，迫使德军退守埃纳河挖掘战壕，西线进入惨烈阵地消耗战！",
            effectSummary: "法国与英国获 180 日【马恩河奇迹】（防御 +32%、进攻 +14%）、士气 +22。",
            illustration: "scroll_marne_1914",
            actorSpecId: "france", targetSpecId: "germany",
            choices: [
                Choice(title: "出租车抢运援军 · 奇迹守住巴黎（史实）", subtitle: "粉碎施里芬速胜计划，西线转入堑壕持久战", isHistorical: true, effectCode: "buff:france:马恩河奇迹防线:14:32:1.05:0:180|buff:britain:远征军坚守西线:10:26:1.0:0:180|morale:france:22"),
            ]
        ),
        EventSpec(
            id: "ottoman_entry_1914",
            scenarioIds: ["ww1_1914"],
            triggerYear: 1914, triggerMonth: 10, minDay: 75,
            title: "奥斯曼炮击黑海 · 封锁俄国南方航道",
            headline: "戈本号挂星月旗炮轰敖德萨，奥斯曼帝国正式倒向同盟国",
            dateLabel: "1914 年 10 月 29 日",
            body: "奥斯曼帝国正式向协约国宣战并彻底关闭达达尼尔海峡，斩断了英法经黑海向俄罗斯帝国运送军火的海上生命线！",
            effectSummary: "奥斯曼向俄、英、法宣战并获 150 日【海峡炮台防卫】（防御 +28%、海战 +18%）。",
            illustration: "event_weserubung_1940",
            actorSpecId: "ottoman", targetSpecId: "russia",
            choices: [
                Choice(title: "封锁海峡 · 同盟国南线开火（史实）", subtitle: "切断黑海援俄航道，开辟高加索与近东战线", isHistorical: true, effectCode: "war:ottoman:russia:1|war:ottoman:britain:1|war:ottoman:france:1|buff:ottoman:达达尼尔炮台:8:28:1.0:18:150|tension:12"),
            ]
        ),
        EventSpec(
            id: "gallipoli_1915",
            scenarioIds: ["ww1_1914"],
            triggerYear: 1915, triggerMonth: 4, minDay: 245,
            title: "加里波利战役 · 凯末尔力挽海峡狂澜",
            headline: "英法澳新联军强登半岛受阻，奥斯曼守军死守峭壁",
            dateLabel: "1915 年 4 月 25 日",
            body: "丘吉尔力主强攻达达尼尔海峡以敲开君士坦丁堡大门，却在加里波利峭壁遭遇凯末尔指挥的奥斯曼守军拼死阻击，联军损失惨重被迫撤离。",
            effectSummary: "奥斯曼获 150 日【加里波利死守】（防御 +34%、士气 +24）。",
            illustration: "scroll_dunkirk_1940",
            actorSpecId: "ottoman", targetSpecId: "britain",
            choices: [
                Choice(title: "凯末尔死守加里波利峭壁（史实）", subtitle: "挫败协约国海峡登陆计划", isHistorical: true, effectCode: "buff:ottoman:加里波利奇迹防卫:12:34:1.0:15:150|morale:ottoman:24"),
            ]
        ),
        EventSpec(
            id: "italy_london_1915",
            scenarioIds: ["ww1_1914"],
            triggerYear: 1915, triggerMonth: 5, minDay: 275,
            title: "《伦敦密约》· 意大利倒向协约国对奥匈宣战",
            headline: "亚平宁战火骤燃！伊松佐河畔打响十二场血腥山地战",
            dateLabel: "1915 年 5 月 23 日",
            body: "在英法许诺割让南蒂罗尔与达尔马提亚的诱惑下，意大利王国毅然放弃中立加入协约国，向昔日盟友奥匈帝国宣战，开辟阿尔卑斯高山战线！",
            effectSummary: "意大利正式加入协约国并对奥匈帝国宣战；全球紧张度 +10。",
            illustration: "event_munich_1938",
            actorSpecId: "italy", targetSpecId: "austria_hungary",
            choices: [
                Choice(title: "意大利加入协约国进攻奥匈（史实）", subtitle: "阿尔卑斯与伊松佐河战线全面燃起", isHistorical: true, effectCode: "ally:britain:italy|war:italy:austria_hungary:1|buff:italy:阿尔卑斯进军:18:16:1.05:0:120|tension:10"),
                Choice(title: "意大利坚守三国同盟中立（架空）", subtitle: "奥匈免于两面受敌", isHistorical: false, effectCode: "gold:italy:300|tension:-4"),
            ]
        ),
        EventSpec(
            id: "gorlice_tarnow_1915",
            scenarioIds: ["ww1_1914"],
            triggerYear: 1915, triggerMonth: 5, minDay: 260,
            title: "戈尔利采—塔尔努夫突破 · 俄军大撤退",
            headline: "马肯森集中重炮轰穿东线，德奥联军席卷华沙与波兰",
            dateLabel: "1915 年 5 月 2 日",
            body: "德奥联军在加利西亚集中空前炮火密度轰开俄军防线，沙俄因炮弹严重短缺被迫实施长达数百公里的「大撤退」，波兰全境落入同盟国之手。",
            effectSummary: "德国与奥匈获 150 日【东线大突破】（进攻 +28%、行军 ×1.18）。",
            illustration: "scroll_tannenberg_1914",
            actorSpecId: "germany", targetSpecId: "russia",
            choices: [
                Choice(title: "马肯森重炮突破东线（史实）", subtitle: "德奥联军高歌猛进占领波兰与立陶宛", isHistorical: true, effectCode: "buff:germany:东线大突破:28:8:1.18:0:150|buff:austria_hungary:加利西亚反击:20:10:1.12:0:120"),
            ]
        ),
        EventSpec(
            id: "bulgaria_joins_cp_1915",
            scenarioIds: ["ww1_1914"],
            triggerYear: 1915, triggerMonth: 10, minDay: 390,
            title: "保加利亚加入同盟国 · 巴尔干铁道贯通",
            headline: "索菲亚出兵夹击塞尔维亚，柏林至君士坦丁堡陆路打通",
            dateLabel: "1915 年 10 月 14 日",
            body: "保加利亚王国为收复马其顿正式加入同盟国并从东侧突袭塞尔维亚，德奥保三路合击打通了柏林直抵伊斯坦布尔的战略铁路。",
            effectSummary: "保加利亚加入同盟国并向塞尔维亚宣战；同盟国获补给增援。",
            illustration: "event_schlieffen_1914",
            actorSpecId: "bulgaria", targetSpecId: "serbia",
            choices: [
                Choice(title: "保加利亚加入同盟国进攻塞尔维亚（史实）", subtitle: "打通中欧至奥斯曼陆上走廊", isHistorical: true, effectCode: "ally:germany:bulgaria|war:bulgaria:serbia:1|gold:ottoman:280|buff:bulgaria:马其顿突击:22:10:1.15:0:120"),
            ]
        ),
        EventSpec(
            id: "verdun_1916",
            scenarioIds: ["ww1_1914"],
            triggerYear: 1916, triggerMonth: 2, minDay: 520,
            title: "凡尔登绞肉机 · 「他们休想通过！」",
            headline: "法肯海因发动「放血战」，贝当沿圣路日夜运兵死守凡尔登",
            dateLabel: "1916 年 2 月 21 日",
            body: "德军在凡尔登倾泻数百万发炮弹企图耗尽法国最后鲜血，法军以「他们休想通过」的钢铁誓言死守十个月，凡尔登化作一战最惨烈的钢铁炼狱！",
            effectSummary: "法国获 200 日【凡尔登死守】（防御 +38%、士气 +20）；双方进入消耗极限。",
            illustration: "scroll_verdun_1916",
            actorSpecId: "france", targetSpecId: "germany",
            choices: [
                Choice(title: "死守圣路 · 绝不放弃凡尔登（史实）", subtitle: "法军钢铁意志粉碎德军消耗阴谋", isHistorical: true, effectCode: "buff:france:凡尔登钢铁防线:12:38:1.0:0:200|morale:france:20|buff:germany:凡尔登重炮轰击:22:12:1.0:0:150"),
            ]
        ),
        EventSpec(
            id: "jutland_1916",
            scenarioIds: ["ww1_1914"],
            triggerYear: 1916, triggerMonth: 5, minDay: 610,
            title: "日德兰大海战 · 无畏舰巅峰对决",
            headline: "二百五十艘钢铁巨舰云集北海！皇家海军牢控海上封锁网",
            dateLabel: "1916 年 5 月 31 日",
            body: "英国大舰队与德国公海舰队在日德兰半岛外海爆发史上最宏伟的战列舰对决。德军战术击沉较多英舰，却终究无力打破英国皇家海军对北海的战略封锁！",
            effectSummary: "大英帝国获 240 日【北海制海封锁】（海战 +35%）、国库 +350。",
            illustration: "scroll_jutland_1916",
            actorSpecId: "britain", targetSpecId: "germany",
            choices: [
                Choice(title: "锁死北海 · 逼退公海舰队（史实）", subtitle: "协约国彻底掌握全球海洋贸易命脉", isHistorical: true, effectCode: "buff:britain:大舰队北海封锁:10:14:1.0:35:240|gold:britain:350"),
            ]
        ),
        EventSpec(
            id: "brusilov_1916",
            scenarioIds: ["ww1_1914"],
            triggerYear: 1916, triggerMonth: 6, minDay: 635,
            title: "勃鲁西洛夫大攻势 · 沙俄最后辉煌",
            headline: "多点渗透战术惊艳世界！奥匈东线全线崩退，罗马尼亚参战",
            dateLabel: "1916 年 6 月 4 日",
            body: "俄国名将勃鲁西洛夫首创宽正面短炮击渗透战术，在西南战线一举重创奥匈帝国数十万大军，并直接促使罗马尼亚王国加入协约国参战！",
            effectSummary: "俄罗斯获 150 日【勃鲁西洛夫渗透攻势】（进攻 +32%、行军 ×1.20）；罗马尼亚加入协约国对奥匈宣战！",
            illustration: "scroll_tannenberg_1914",
            actorSpecId: "russia", targetSpecId: "austria_hungary",
            choices: [
                Choice(title: "发动勃鲁西洛夫大攻势（史实）", subtitle: "重创奥匈主力并吸引罗马尼亚参战", isHistorical: true, effectCode: "buff:russia:勃鲁西洛夫渗透:32:12:1.20:0:150|ally:britain:romania|war:romania:austria_hungary:1"),
            ]
        ),
        EventSpec(
            id: "somme_tanks_1916",
            scenarioIds: ["ww1_1914"],
            triggerYear: 1916, triggerMonth: 9, minDay: 720,
            title: "索姆河会战 · 人类史上首批坦克投入实战",
            headline: "「马克 I 型」钢铁怪兽碾过铁丝网，陆战迈入机械化新纪元！",
            dateLabel: "1916 年 9 月 15 日",
            body: "索姆河惨烈鏖战中，英军首次将秘密研制的履带装甲战车「坦克」投入战场，碾碎机枪阵地与铁丝网，彻底改写了此后百年的现代战争形态。",
            effectSummary: "大英帝国与法国获 180 日【初代坦克突击】（进攻 +24%、工业 +22）。",
            illustration: "event_fall_weiss_1939",
            actorSpecId: "britain", targetSpecId: "germany",
            choices: [
                Choice(title: "投入马克 I 型坦克破阵（史实）", subtitle: "协约国开启装甲机械化先河", isHistorical: true, effectCode: "buff:britain:马克I型坦克突击:24:14:1.10:0:180|ic:britain:22|ic:france:16"),
            ]
        ),
        EventSpec(
            id: "greece_entente_1917",
            scenarioIds: ["ww1_1914"],
            triggerYear: 1917, triggerMonth: 6, minDay: 990,
            title: "希腊加入协约国 · 萨洛尼卡战线反攻",
            headline: "韦尼泽洛斯重掌雅典，协约国在爱琴海北岸集结巴尔干反攻兵团",
            dateLabel: "1917 年 6 月 27 日",
            body: "希腊结束国内「大分裂」正式加入协约国，向保加利亚、奥斯曼与德奥同盟国宣战，巴尔干反攻的号角就此吹响。",
            effectSummary: "希腊加入协约国并对保加利亚、奥斯曼宣战，获 150 日【爱琴海反攻】加成。",
            illustration: "scroll_marne_1914",
            actorSpecId: "greece", targetSpecId: "bulgaria",
            choices: [
                Choice(title: "希腊加入协约国出兵马其顿（史实）", subtitle: "巴尔干协约阵营再度壮大", isHistorical: true, effectCode: "ally:britain:greece|war:greece:bulgaria:1|war:greece:ottoman:1|buff:greece:萨洛尼卡进军:20:16:1.10:15:150"),
            ]
        ),
        EventSpec(
            id: "brest_litovsk_1918",
            scenarioIds: ["ww1_1914"],
            triggerYear: 1918, triggerMonth: 3, minDay: 1240,
            title: "布列斯特和约 · 东线停战与德军西调",
            headline: "俄国退出大战割让西部疆土，百万德军急调西线作最后一搏",
            dateLabel: "1918 年 3 月 3 日",
            body: "历经革命动荡的俄国被迫与同盟国签署《布列斯特—立托夫斯克和约》退出大战，德国得以抽调数十个精锐师扑向巴黎展开「皇帝会战」！",
            effectSummary: "德俄停战，俄国割让西部边境 16% 给德国；德国获 120 日【皇帝会战·暴风突击队】（进攻 +34%、行军 ×1.22）。",
            illustration: "event_molotov_ribbentrop",
            actorSpecId: "germany", targetSpecId: "russia",
            choices: [
                Choice(title: "签署布列斯特和约·全力西线决战（史实）", subtitle: "东线停火，德军发动春季暴风突击", isHistorical: true, effectCode: "cede:russia:germany:16|peace:germany:russia|peace:austria_hungary:russia|buff:germany:皇帝会战·暴风突击:34:0:1.22:0:120"),
                Choice(title: "俄国拒绝签和·死战到底（架空）", subtitle: "东线继续两线消耗德国主力", isHistorical: false, effectCode: "buff:russia:誓死保卫东线:14:26:1.0:0:150"),
            ]
        ),
        EventSpec(
            id: "hundred_days_1918",
            scenarioIds: ["ww1_1914"],
            triggerYear: 1918, triggerMonth: 8, minDay: 1380,
            title: "百日攻势 · 福煦元帅率协约国全线总攻",
            headline: "亚眠坦克重炮协同破防！德军兴登堡防线土崩瓦解",
            dateLabel: "1918 年 8 月 8 日",
            body: "美军源源不断增援西线后，协约国总司令福煦元帅指挥英法美加联军发动雷霆万钧的「百日攻势」，德军陷入绝境，大战终局降临！",
            effectSummary: "英法获 180 日【百日大总攻】（进攻 +38%、行军 ×1.25）、国库 +500、工业 +35。",
            illustration: "scroll_marne_1914",
            actorSpecId: "france", targetSpecId: "germany",
            choices: [
                Choice(title: "发动百日总攻 · 突破兴登堡防线（史实）", subtitle: "协约国锁定一战最终胜局", isHistorical: true, effectCode: "buff:france:百日大总攻:38:16:1.25:0:180|buff:britain:亚眠装甲破防:36:16:1.25:20:180|gold:france:500|ic:britain:35"),
            ]
        ),
        EventSpec(
            id: "armistice_1918",
            scenarioIds: ["ww1_1914"],
            triggerYear: 1918, triggerMonth: 11, minDay: 1470,
            title: "贡比涅森林停战钟声 · 帝国黄昏",
            headline: "十一月十一日十一时，四年浩劫震碎四大旧帝国",
            dateLabel: "1918 年 11 月 11 日",
            body: "历经四年血火洗礼，欧洲各大参战国均已精疲力竭。无论战场上胜负如何，近代民族国家的新纪元已在炮火废墟之上拉开大幕。",
            effectSummary: "协约国士气大振 +25，英法获战后重建财政 +400。",
            illustration: "scroll_silkroad_peace",
            actorSpecId: "britain", targetSpecId: nil,
            choices: [
                Choice(title: "铭记停战时刻 · 重塑欧陆新秩序（史实）", subtitle: "协约阵营士气与威望攀升", isHistorical: true, effectCode: "morale:britain:25|morale:france:25|gold:britain:400|gold:france:400"),
            ]
        ),
    ]

    // MARK: - 5. 1812 拿破仑欧陆 · 远征莫斯科（10 条）

    private static let napoleon1812Events: [EventSpec] = [
        EventSpec(
            id: "niemen_crossing_1812",
            scenarioIds: ["napoleon_1812"],
            triggerYear: 1812, triggerMonth: 6, minDay: 6,
            title: "强渡涅曼河 · 六十万大军团东征",
            headline: "法兰西帝国雄鹰展翅！人类史上前所未有的多国大军团踏入俄境",
            dateLabel: "1812 年 6 月 24 日",
            body: "拿破仑率领汇聚法兰西、德意志、波兰与意大利精锐的六十万「大军团」强渡涅曼河，誓要一战迫使沙皇亚历山大一世重回大陆封锁体系！",
            effectSummary: "法兰西第一帝国获 120 日【大军团强渡涅曼】（进攻 +30%、行军 ×1.25）。",
            illustration: "scroll_austerlitz_1805",
            actorSpecId: "france", targetSpecId: "russia",
            choices: [
                Choice(title: "挥师东征 · 直指斯摩棱斯克与莫斯科（史实）", subtitle: "帝国铁骑势不可挡", isHistorical: true, effectCode: "buff:france:大军团东征:30:8:1.25:0:120|morale:france:20"),
            ]
        ),
        EventSpec(
            id: "salamanca_1812",
            scenarioIds: ["napoleon_1812"],
            triggerYear: 1812, triggerMonth: 7, minDay: 35,
            title: "萨拉曼卡大捷 · 威灵顿攻克马德里",
            headline: "「在四十分钟内击败四万法军！」伊比利亚半岛战线全面反攻",
            dateLabel: "1812 年 7 月 22 日",
            body: "趁拿破仑主力东征俄国之机，威灵顿公爵统率英葡西联军在萨拉曼卡以迅雷不及掩耳之势击溃马尔蒙法军，西班牙游击战烈火烧遍伊比利亚！",
            effectSummary: "大英、西班牙、葡萄牙获 180 日【半岛解放反攻】（进攻 +24%、防御 +20%）。",
            illustration: "scroll_austerlitz_1805",
            actorSpecId: "britain", targetSpecId: "france",
            choices: [
                Choice(title: "威灵顿铁拳反攻伊比利亚（史实）", subtitle: "半岛战线死死钉住法军数十万精锐", isHistorical: true, effectCode: "buff:britain:萨拉曼卡大捷:24:18:1.15:18:180|buff:spain:伊比利亚游击抗法:18:24:1.12:0:180|buff:portugal:英葡联军推进:18:18:1.10:0:180"),
            ]
        ),
        EventSpec(
            id: "borodino_1812",
            scenarioIds: ["napoleon_1812"],
            triggerYear: 1812, triggerMonth: 9, minDay: 85,
            title: "博罗季诺血战 · 莫斯科门户决死战",
            headline: "二十五万大军在千门大炮轰鸣中惨烈肉搏，双方元气俱伤",
            dateLabel: "1812 年 9 月 7 日",
            body: "库图佐夫在莫斯科西郊博罗季诺筑起巴格拉季昂棱堡与拉耶夫斯基炮台，法俄二十五万大军展开拿破仑时代最惨烈单日血战，俄军虽战略后撤却保全了主力！",
            effectSummary: "法俄双军士气震荡，俄罗斯激活【保卫圣城】韧性（防御 +24%）。",
            illustration: "scroll_borodino_1812",
            actorSpecId: "russia", targetSpecId: "france",
            choices: [
                Choice(title: "博罗季诺死战后坚壁清野（史实）", subtitle: "保全俄军主力，诱敌陷入莫斯科空城", isHistorical: true, effectCode: "buff:russia:博罗季诺坚忍:16:28:1.05:0:120|morale:russia:16"),
            ]
        ),
        EventSpec(
            id: "russian_winter_1812",
            scenarioIds: ["napoleon_1812"],
            triggerYear: 1812, triggerMonth: 11, minDay: 140,
            title: "莫斯科大火与俄国严冬",
            headline: "库图佐夫焦土诱敌！严寒冻霜吞噬法军大军团补给线",
            dateLabel: "1812 年 11 月",
            body: "俄军实行坚决的坚壁清野与焦土战术，随着暴雪严寒提前降临东欧平原，远离本土补给基地的法兰西大军团陷入绝境，反法同盟全面吹响反攻号角！",
            effectSummary: "俄罗斯帝国获 180 日【冬将军反攻】（攻防 +32%、行军 ×1.20），哥萨克全线追击！",
            illustration: "event_winter_1812",
            actorSpecId: "russia", targetSpecId: "france",
            choices: [
                Choice(title: "发动焦土寒冬大反击（史实）", subtitle: "哥萨克骑兵与寒冬合围追击撤退法军", isHistorical: true, effectCode: "buff:russia:冬将军反攻:32:30:1.20:0:180|war:russia:france:1|morale:france:-20"),
                Choice(title: "在莫斯科城下决战讲和（架空）", subtitle: "尝试与拿破仑媾和止战", isHistorical: false, effectCode: "peace:russia:france"),
            ]
        ),
        EventSpec(
            id: "prussia_liberation_1813",
            scenarioIds: ["napoleon_1812"],
            triggerYear: 1813, triggerMonth: 3, minDay: 260,
            title: "普鲁士解放战争 · 铁十字勋章诞生",
            headline: "布吕歇尔与沙恩霍斯特吹响反法号角，普鲁士正式加入第六次反法同盟",
            dateLabel: "1813 年 3 月 17 日",
            body: "法军东征惨败的消息传回柏林，腓特烈·威廉三世发表《告我国民书》创立铁十字勋章，普鲁士军民群情激昂，联手俄罗斯向拿破仑宣战！",
            effectSummary: "普鲁士加入反法同盟并向法兰西宣战，获 180 日【普鲁士解放战争】（进攻 +28%、士气 +25）。",
            illustration: "scroll_austerlitz_1805",
            actorSpecId: "prussia", targetSpecId: "france",
            choices: [
                Choice(title: "布吕歇尔出师 · 加入反法同盟（史实）", subtitle: "普俄联军在德意志草原发起大反攻", isHistorical: true, effectCode: "ally:russia:prussia|war:prussia:france:1|buff:prussia:普鲁士解放战争:28:18:1.18:0:180|morale:prussia:25"),
                Choice(title: "普鲁士继续观望自保（架空）", subtitle: "暂不对法兰西宣战", isHistorical: false, effectCode: "gold:prussia:240"),
            ]
        ),
        EventSpec(
            id: "sweden_coalition_1813",
            scenarioIds: ["napoleon_1812"],
            triggerYear: 1813, triggerMonth: 5, minDay: 320,
            title: "贝尔纳多特率瑞典南下反法",
            headline: "昔日帝国元帅倒戈北翼！瑞典出兵德意志直逼丹麦—挪威",
            dateLabel: "1813 年 5 月",
            body: "瑞典王储摄政贝尔纳多特审时度势，率领瑞典北方军团加入反法同盟，既图夺取挪威又拟定「特拉亨堡计划」避实击虚围剿法军！",
            effectSummary: "瑞典加入反法同盟并对法兰西、丹麦宣战，获 150 日【特拉亨堡策略】加成。",
            illustration: "event_weserubung_1940",
            actorSpecId: "sweden", targetSpecId: "denmark",
            choices: [
                Choice(title: "瑞典加入反法同盟 · 进军北欧与德意志（史实）", subtitle: "北翼牵制法丹联军", isHistorical: true, effectCode: "ally:britain:sweden|war:sweden:france:1|war:sweden:denmark:1|buff:sweden:特拉亨堡战法:22:16:1.15:18:150"),
            ]
        ),
        EventSpec(
            id: "austria_coalition_1813",
            scenarioIds: ["napoleon_1812"],
            triggerYear: 1813, triggerMonth: 8, minDay: 405,
            title: "梅特涅亮剑 · 奥地利加入第六次反法同盟",
            headline: "布拉格和谈破裂！施瓦岑贝格率二十五万奥军杀入萨克森",
            dateLabel: "1813 年 8 月 12 日",
            body: "拿破仑拒绝奥地利首相梅特涅的调停条件后，维也纳果断向法兰西宣战。俄、普、奥、瑞、英史上最强反法同盟正式合拢！",
            effectSummary: "奥地利加入反法同盟并对法兰西宣战，获 180 日【帝国联军总攻】加成。",
            illustration: "event_munich_1938",
            actorSpecId: "austria", targetSpecId: "france",
            choices: [
                Choice(title: "奥地利加入反法同盟决战德意志（史实）", subtitle: "天平彻底倾倒，诸国决战在即", isHistorical: true, effectCode: "ally:russia:austria|war:austria:france:1|buff:austria:波希米亚大军团:24:20:1.12:0:180"),
                Choice(title: "维也纳维持婚姻盟约保持中立（架空）", subtitle: "拿破仑保住南翼喘息空间", isHistorical: false, effectCode: "pact:france:austria:3|gold:austria:300"),
            ]
        ),
        EventSpec(
            id: "leipzig_nations_1813",
            scenarioIds: ["napoleon_1812"],
            triggerYear: 1813, triggerMonth: 10, minDay: 470,
            title: "莱比锡诸国大会战 · 欧陆霸权决战",
            headline: "六十万大军云集萨克森平原！拿破仑帝国命运在此一役",
            dateLabel: "1813 年 10 月 16 日",
            body: "俄、普、奥、瑞四国联军与拿破仑大军在莱比锡展开一战前欧洲最大规模决战，双方火炮轰鸣四昼夜，法兰西莱茵霸权危如累卵！",
            effectSummary: "反法同盟各主力获 150 日【莱比锡诸国大捷】加成；拿破仑激活【绝境军神】孤注一掷。",
            illustration: "scroll_borodino_1812",
            actorSpecId: "france", targetSpecId: "austria",
            choices: [
                Choice(title: "诸国大会战 · 决定欧洲百年格局（史实）", subtitle: "俄普奥联军乘胜西渡莱茵河", isHistorical: true, effectCode: "buff:austria:诸国大会战胜利:26:16:1.15:0:150|buff:prussia:渡过莱茵河:28:14:1.18:0:150|buff:france:老近卫军死战:22:22:1.10:0:120"),
            ]
        ),
        EventSpec(
            id: "treaty_of_kiel_1814",
            scenarioIds: ["napoleon_1812"],
            triggerYear: 1814, triggerMonth: 1, minDay: 560,
            title: "《基尔条约》· 挪威改归瑞典共主",
            headline: "北欧版图重绘！丹麦—挪威联合王国宣告解体",
            dateLabel: "1814 年 1 月 14 日",
            body: "瑞典军团逼近石勒苏益格后，丹麦国王被迫签署《基尔条约》，将挪威割让瑞典换取停战，长达四百年的丹麦—挪威联合走向终点。",
            effectSummary: "丹麦割让挪威地区 45% 给瑞典并与瑞典停战。",
            illustration: "event_weserubung_1940",
            actorSpecId: "sweden", targetSpecId: "denmark",
            choices: [
                Choice(title: "签署基尔条约 · 挪威并入瑞典（史实）", subtitle: "北欧格局尘埃落定", isHistorical: true, effectCode: "cede:denmark:sweden:45|peace:sweden:denmark"),
                Choice(title: "丹麦—挪威誓死卫国拒签（架空）", subtitle: "北欧战火继续燃烧", isHistorical: false, effectCode: "buff:denmark:北海死守:14:26:1.0:20:120"),
            ]
        ),
        EventSpec(
            id: "hundred_days_waterloo_1815",
            scenarioIds: ["napoleon_1812"],
            triggerYear: 1815, triggerMonth: 6, minDay: 1050,
            title: "百日王朝与滑铁卢终极决战",
            headline: "「皇帝从厄尔巴岛回来了！」法兰西鹰旗迎来最后绝唱",
            dateLabel: "1815 年 6 月 18 日",
            body: "拿破仑重返巴黎掀起震动全欧的百日王朝，与威灵顿、布吕歇尔在滑铁卢展开永恒载入史册的终局大决战！",
            effectSummary: "法兰西获 120 日【百日王朝老近卫军】爆发（进攻 +36%、士气 +30）；英普获【滑铁卢铁壁】。",
            illustration: "scroll_austerlitz_1805",
            actorSpecId: "france", targetSpecId: "britain",
            choices: [
                Choice(title: "百日王朝 · 决战滑铁卢（史实）", subtitle: "法兰西与反法联军展开世纪谢幕大战", isHistorical: true, effectCode: "buff:france:百日王朝老近卫军:36:18:1.22:0:120|buff:britain:滑铁卢红衫方阵:24:34:1.10:0:120|morale:france:30|morale:britain:24"),
            ]
        ),
    ]

    // MARK: - 6. 1950 冷战铁幕 · 核威慑与两极格局（12 条）

    private static let coldWar1950Events: [EventSpec] = [
        EventSpec(
            id: "sino_soviet_treaty_1950",
            scenarioIds: ["coldwar_1950"],
            triggerYear: 1950, triggerMonth: 2, minDay: 10,
            title: "《中苏友好同盟互助条约》与 156 项工程",
            headline: "莫斯科红场握手！东方阵营奠定欧亚大陆钢铁基石",
            dateLabel: "1950 年 2 月 14 日",
            body: "中华人民共和国与苏联签署友好同盟互助条约，苏联向新中国援建 156 项大型重工业与国防骨干工程，东方工业化浪潮奔涌向前！",
            effectSummary: "新中国工业产能 +35、国库 +450、推行【五年重工业计划】；中苏锁定同盟。",
            illustration: "scroll_nato_warsaw_1955",
            actorSpecId: "prc", targetSpecId: "ussr",
            choices: [
                Choice(title: "缔结中苏同盟 · 启动 156 项工程（史实）", subtitle: "新中国重工业与国防建设腾飞", isHistorical: true, effectCode: "ally:ussr:prc|ic:prc:35|gold:prc:450|law:prc:focus_five_year|tension:8"),
            ]
        ),
        EventSpec(
            id: "korean_war_1950",
            scenarioIds: ["coldwar_1950"],
            triggerYear: 1950, triggerMonth: 6, minDay: 45,
            title: "朝鲜半岛铁幕危机 · 抗美援朝",
            headline: "三八线烽火燃起！志愿军雄赳赳跨过鸭绿江保家卫国",
            dateLabel: "1950 年 6 月 25 日",
            body: "冷战从政治铁幕骤然升级为热战对抗，美军介入半岛逼近鸭绿江，新中国毅然出兵抗美援朝、保家卫国，以穿插迂回战术震惊全球！",
            effectSummary: "新中国获 240 日【抗美援朝·三三制穿插】（进攻 +28%、防御 +36%、士气 +26）；全球紧张度 +24。",
            illustration: "event_korean_war_1950",
            actorSpecId: "prc", targetSpecId: "usa",
            choices: [
                Choice(title: "抗美援朝 · 保家卫国（史实）", subtitle: "新中国精锐志愿军展现惊人穿插与防御战力", isHistorical: true, effectCode: "buff:prc:抗美援朝·三三制穿插:28:36:1.18:0:240|morale:prc:26|ic:usa:28|tension:24"),
                Choice(title: "强化东北边防、外交斡旋（架空）", subtitle: "专注国内重工业建设", isHistorical: false, effectCode: "ic:prc:30|tension:10"),
            ]
        ),
        EventSpec(
            id: "marshall_plan_1950",
            scenarioIds: ["coldwar_1950"],
            triggerYear: 1950, triggerMonth: 10, minDay: 110,
            title: "马歇尔计划与西欧经济奇迹",
            headline: "百亿美元美援激活莱茵与亚平宁工厂，欧洲煤钢联营启航",
            dateLabel: "1950 年 10 月",
            body: "在美国马歇尔计划的强力输血下，西德、意大利、法国与英国迅速抹平二战废墟，西欧迎来战后黄金增长期。",
            effectSummary: "西欧北约、英国、法国工业产能大增，美国出口贸易高涨。",
            illustration: "scroll_berlin_airlift_1948",
            actorSpecId: "usa", targetSpecId: "west_europe",
            choices: [
                Choice(title: "全面推进马歇尔重建计划（史实）", subtitle: "西欧北约工业与财政大幅跃升", isHistorical: true, effectCode: "ic:west_europe:36|ic:france:22|gold:west_europe:500|gold:usa:350"),
            ]
        ),
        EventSpec(
            id: "japan_boom_1951",
            scenarioIds: ["coldwar_1950"],
            triggerYear: 1951, triggerMonth: 9, minDay: 360,
            title: "旧金山和约与日本战后重工复苏",
            headline: "太平洋军需特需拉动日本造船与钢铁业迅速起飞",
            dateLabel: "1951 年 9 月 8 日",
            body: "《旧金山和约》与《美日安保条约》签署，日本结束盟军占领并依托远东特需订单重振工业，成为美国在西太平洋的核心前沿支点。",
            effectSummary: "日本工业产能 +32、国库 +420，锁定美日同盟。",
            illustration: "scroll_silkroad_peace",
            actorSpecId: "japan", targetSpecId: "usa",
            choices: [
                Choice(title: "缔结安保条约 · 全力经济腾飞（史实）", subtitle: "日本工业产能迅速恢复", isHistorical: true, effectCode: "ally:usa:japan|ic:japan:32|gold:japan:420"),
            ]
        ),
        EventSpec(
            id: "uk_hurricane_1952",
            scenarioIds: ["coldwar_1950"],
            triggerYear: 1952, triggerMonth: 10, minDay: 660,
            title: "大英帝国「飓风行动」核试成功",
            headline: "世界第三个核大国诞生！英国完成首次原子弹试验",
            dateLabel: "1952 年 10 月 3 日",
            body: "大英帝国在蒙特贝洛群岛成功引爆代号「飓风」的原子弹，正式继美苏之后迈入核俱乐部。",
            effectSummary: "大英帝国正式获得 2 枚战略核武器并提升威慑力；全球紧张度 +10。",
            illustration: "event_uk_hurricane_1952",
            actorSpecId: "uk", targetSpecId: nil,
            choices: [
                Choice(title: "宣布飓风核试成功（史实）", subtitle: "大英帝国核武库 +2 枚", isHistorical: true, effectCode: "nuke:uk:2|law:uk:focus_atomic_proj|tension:10"),
            ]
        ),
        EventSpec(
            id: "thermonuclear_1953",
            scenarioIds: ["coldwar_1950"],
            triggerYear: 1953, triggerMonth: 8, minDay: 900,
            title: "美苏氢弹试爆 · 相互确保摧毁时代降临",
            headline: "比基尼环礁与塞米巴拉金斯克蘑菇云相继升腾，冷战进入热核平衡",
            dateLabel: "1953 年 8 月 12 日",
            body: "美苏相继突破百万吨级热核氢弹技术，战略轰炸机与洲际导弹竞赛白热化，「相互确保摧毁」成为维系两大超级大国微妙平衡的达摩克利斯之剑。",
            effectSummary: "美国、苏联各增战略核武 +2 枚、工业 +24；全球紧张度 +14。",
            illustration: "scroll_cuban_1962",
            actorSpecId: "ussr", targetSpecId: "usa",
            choices: [
                Choice(title: "迈入热核威慑平衡时代（史实）", subtitle: "美苏核武库双双扩容", isHistorical: true, effectCode: "nuke:usa:2|nuke:ussr:2|ic:usa:24|ic:ussr:24|tension:14"),
            ]
        ),
        EventSpec(
            id: "bandung_nonaligned_1955",
            scenarioIds: ["coldwar_1950"],
            triggerYear: 1955, triggerMonth: 4, minDay: 1200,
            title: "万隆亚非会议与不结盟浪潮",
            headline: "求同存异！亚非拉新兴独立国家发出和平发展强音",
            dateLabel: "1955 年 4 月 18 日",
            body: "印度、中国、埃及、南斯拉夫与亚非各国代表齐聚万隆，和平共处五项原则响彻世界，不结盟运动迅速成长为美苏两极之外的第三支重要力量！",
            effectSummary: "印度、不结盟阵营与拉美工业产能 +22、国库 +350，防御韧性提升。",
            illustration: "scroll_silkroad_peace",
            actorSpecId: "india", targetSpecId: "yugo_mideast",
            choices: [
                Choice(title: "高举求同存异与不结盟旗帜（史实）", subtitle: "亚非拉新兴世界加速自主建设", isHistorical: true, effectCode: "ic:india:24|ic:yugo_mideast:22|ic:latam:20|gold:india:350|gold:yugo_mideast:350|tension:-6"),
            ]
        ),
        EventSpec(
            id: "warsaw_pact_1955",
            scenarioIds: ["coldwar_1950"],
            triggerYear: 1955, triggerMonth: 5, minDay: 1245,
            title: "华沙条约组织正式成立",
            headline: "西德加入北约引发强硬反制，欧陆两大军事集团全面定型",
            dateLabel: "1955 年 5 月 14 日",
            body: "因西德重整军备并加入北大西洋公约组织，苏联与波兰、捷克斯洛伐克、匈牙利、罗马尼亚、保加利亚、东德缔结《华沙条约》，铁幕两极对峙达至顶峰！",
            effectSummary: "苏联与东欧华约获 240 日【华约钢铁联合】加成，西欧北约同步战备提升；紧张度 +14。",
            illustration: "scroll_nato_warsaw_1955",
            actorSpecId: "ussr", targetSpecId: "warsaw_east",
            choices: [
                Choice(title: "组建华沙条约联合司令部（史实）", subtitle: "欧陆两大军事集团武装对峙", isHistorical: true, effectCode: "ally:ussr:warsaw_east|buff:ussr:华约钢铁洪流:20:20:1.10:0:240|buff:warsaw_east:华约防线:16:26:1.05:0:240|buff:west_europe:北约中欧防线:16:26:1.05:0:240|tension:14"),
            ]
        ),
        EventSpec(
            id: "suez_crisis_1956",
            scenarioIds: ["coldwar_1950"],
            triggerYear: 1956, triggerMonth: 10, minDay: 1500,
            title: "苏伊士运河危机 · 旧殖民帝国落幕",
            headline: "纳赛尔宣布运河国有化，美苏罕见联手施压英法撤军",
            dateLabel: "1956 年 10 月 29 日",
            body: "埃及宣布将苏伊士运河收归国有引发中东风暴，英法出兵干涉却遭美苏两强同时施压被迫停火，标志着老牌欧洲殖民帝国时代彻底谢幕。",
            effectSummary: "中东不结盟阵营获国库 +450、士气 +22；紧张度 +10。",
            illustration: "scroll_el_alamein_1942",
            actorSpecId: "yugo_mideast", targetSpecId: "uk",
            choices: [
                Choice(title: "收回苏伊士运河主权（史实）", subtitle: "阿拉伯民族独立浪潮席卷中东", isHistorical: true, effectCode: "gold:yugo_mideast:450|morale:yugo_mideast:22|tension:10"),
                Choice(title: "英法强行军事占领运河区（架空）", subtitle: "中东爆发全面热战", isHistorical: false, effectCode: "war:uk:yugo_mideast:1|war:france:yugo_mideast:1|tension:24"),
            ]
        ),
        EventSpec(
            id: "sputnik_1957",
            scenarioIds: ["coldwar_1950"],
            triggerYear: 1957, triggerMonth: 10, minDay: 1750,
            title: "斯普特尼克一号升空 · 太空争霸开启",
            headline: "人类第一颗人造卫星发出滴滴电波，洲际导弹与航天竞赛全面引爆！",
            dateLabel: "1957 年 10 月 4 日",
            body: "拜科努尔发射场一声巨响，苏联成功发射「斯普特尼克一号」震动白宫。美苏随即投入天文数字预算展开阿波罗登月与洲际战略导弹竞赛！",
            effectSummary: "苏联与美国工业产能各 +30，战略核威慑与科研全面跃升。",
            illustration: "scroll_cuban_1962",
            actorSpecId: "ussr", targetSpecId: "usa",
            choices: [
                Choice(title: "迈向星辰大海 · 太空竞赛加速（史实）", subtitle: "两大超级大国科研与重工再上新阶", isHistorical: true, effectCode: "ic:ussr:32|ic:usa:32|morale:ussr:18|tension:8"),
            ]
        ),
        EventSpec(
            id: "cuban_missile_1962",
            scenarioIds: ["coldwar_1950"],
            triggerYear: 1962, triggerMonth: 10, minDay: 2400,
            title: "加勒比海导弹危机 · 人类最接近核战的十三天",
            headline: "美军封锁加勒比海！华盛顿与莫斯科在核按钮边缘惊险博弈",
            dateLabel: "1962 年 10 月 16 日",
            body: "U-2 侦察机在古巴拍到苏联中程弹道导弹阵地，全世界屏息凝神十三昼夜。美苏最终通过秘密渠道达成妥协并架设「红电话」热线，避免了一场毁灭文明的核大战。",
            effectSummary: "紧张度先升后稳；若走架空路线强硬突破封锁将直接引爆第三次世界大战！",
            illustration: "scroll_cuban_1962",
            actorSpecId: "usa", targetSpecId: "ussr",
            choices: [
                Choice(title: "双方克制撤导 · 建立莫斯科热线（史实）", subtitle: "化险为夷，冷战转入理性管控核平衡", isHistorical: true, effectCode: "pact:usa:ussr:3|gold:usa:300|gold:ussr:300|tension:-10"),
                Choice(title: "强硬突破封锁 · 核威慑失控开战（架空）", subtitle: "美苏北约华约爆发全球热核大战！", isHistorical: false, effectCode: "war:usa:ussr:1|nuke:usa:2|nuke:ussr:2|tension:35"),
            ]
        ),
        EventSpec(
            id: "prc_atomic_1964",
            scenarioIds: ["coldwar_1950"],
            triggerYear: 1964, triggerMonth: 10, minDay: 2800,
            title: "东方巨响 · 罗布泊「两弹一星」核试成功",
            headline: "大漠升起壮丽蘑菇云！新中国打破核垄断屹立世界东方",
            dateLabel: "1964 年 10 月 16 日",
            body: "钱学森、邓稼先等一代元勋隐姓埋名攻克尖端难关，中国第一颗原子弹在罗布泊试验成功并庄严承诺绝不首先使用核武器，彻底改写全球战略格局！",
            effectSummary: "中华人民共和国获得战略核武 +2 枚、工业产能 +35、全军士气 +30！",
            illustration: "event_uk_hurricane_1952",
            actorSpecId: "prc", targetSpecId: nil,
            choices: [
                Choice(title: "宣布两弹成功 · 打破大国核垄断（史实）", subtitle: "新中国战略威慑力历史性跃升", isHistorical: true, effectCode: "nuke:prc:2|law:prc:focus_atomic_proj|ic:prc:35|morale:prc:30|tension:10"),
            ]
        ),
    ]

    // MARK: - 7. 战国 / 三国 / 盛唐 / 宋金 / 日本战国（38 条中华与扶桑史诗事件链）

    private static let ancientAndSengokuEvents: [EventSpec] = [
        // --- 战国七雄（公元前 260 年 · 8 条） ---
        EventSpec(
            id: "changping_260bce",
            scenarioIds: ["zhanguo_260bce"],
            triggerYear: -260, triggerMonth: 7, minDay: 12,
            title: "长平决战 · 武安君白起挂帅出奇兵",
            headline: "赵括纸上谈兵替代廉颇！秦军两万五千奇兵截断赵军粮道",
            dateLabel: "公元前 260 年秋",
            body: "秦昭襄王暗施反间计令赵王临阵换将，武安君白起秘密赴前线诱敌深入、断其归路，长平四十五万赵军陷入铁壁合围，战国一统大势由此倾覆！",
            effectSummary: "秦国获 150 日【武安君奇兵合围】（进攻 +34%、行军 ×1.22）；赵国士气受挫。",
            illustration: "scroll_changping_260bce",
            actorSpecId: "qin", targetSpecId: "zhao",
            choices: [
                Choice(title: "白起绝粮道 · 决胜长平（史实）", subtitle: "秦军锐不可当，三晋防线动摇", isHistorical: true, effectCode: "buff:qin:武安君长平决胜:34:14:1.22:0:150|war:qin:zhao:1|morale:qin:22"),
                Choice(title: "赵王识破反间 · 坚守廉颇壁垒（架空）", subtitle: "廉颇老成持重，长平化作旷日消耗战", isHistorical: false, effectCode: "buff:zhao:廉颇高垒深沟:10:36:1.0:0:180|morale:zhao:24"),
            ]
        ),
        EventSpec(
            id: "handan_rescue_257bce",
            scenarioIds: ["zhanguo_260bce"],
            triggerYear: -257, triggerMonth: 12, minDay: 240,
            title: "信陵君窃符救赵 · 邯郸城下破秦师",
            headline: "魏无忌矫夺晋鄙兵权，春申君率楚军来援，合纵奇军大破秦师！",
            dateLabel: "公元前 257 年",
            body: "秦军乘长平之威合围邯郸，生死存亡之际魏国信陵君窃取虎符率八万精锐星夜驰援，楚国春申君亦挥师北上，三国联军在邯郸城下大破秦军！",
            effectSummary: "赵、魏、楚结盟抗秦，各获 150 日【窃符救赵合纵】（进攻 +24%、防御 +26%）。",
            illustration: "scroll_changping_260bce",
            actorSpecId: "wei", targetSpecId: "qin",
            choices: [
                Choice(title: "信陵君窃符救赵 · 楚魏来援（史实）", subtitle: "合纵义师解邯郸之围，延缓秦灭六国", isHistorical: true, effectCode: "ally:zhao:wei|ally:zhao:chu|war:wei:qin:1|war:chu:qin:1|buff:wei:信陵君救赵:24:22:1.20:0:150|buff:zhao:邯郸解围士气:20:30:1.10:0:150"),
            ]
        ),
        EventSpec(
            id: "zhengguo_canal_246bce",
            scenarioIds: ["zhanguo_260bce"],
            triggerYear: -246, triggerMonth: 5, minDay: 520,
            title: "郑国渠通水 · 关中千里沃野无凶年",
            headline: "韩使「疲秦计」反成大秦霸业基石，关中粮仓溢满天下！",
            dateLabel: "公元前 246 年",
            body: "韩国水工郑国献策修渠本欲消耗秦力，不料渠成之后引泾水灌田四万余顷，关中尽成沃野，为大秦横扫六合源源不断供给军粮！",
            effectSummary: "秦国国库 +550、全军士气 +18，长期财赋大涨。",
            illustration: "scroll_silkroad_peace",
            actorSpecId: "qin", targetSpecId: "han",
            choices: [
                Choice(title: "贯通郑国渠 · 富强关中（史实）", subtitle: "关中化作天下第一粮仓", isHistorical: true, effectCode: "gold:qin:550|morale:qin:18|buff:qin:关中沃野粮足:16:12:1.08:0:200"),
            ]
        ),
        EventSpec(
            id: "five_states_hezhong_247bce",
            scenarioIds: ["zhanguo_260bce"],
            triggerYear: -247, triggerMonth: 4, minDay: 450,
            title: "五国合纵攻秦 · 河外大捷",
            headline: "信陵君挂五国相印！魏赵韩楚燕联军直逼函谷关",
            dateLabel: "公元前 247 年",
            body: "面对秦军步步东侵，关东五国最后一次精诚团结，共推魏无忌为上将军，五国铁骑在河外大败蒙骜、追至函谷关下！",
            effectSummary: "魏、赵、韩、楚、燕缔结抗秦合纵同盟并获 120 日【五国合纵】攻防加成。",
            illustration: "scroll_changping_260bce",
            actorSpecId: "wei", targetSpecId: "qin",
            choices: [
                Choice(title: "五国合纵 · 剑指函谷关（史实）", subtitle: "关东列强联手遏制暴秦", isHistorical: true, effectCode: "ally:wei:han|ally:wei:yan|buff:wei:五国合纵军威:26:20:1.15:0:120|buff:chu:合纵北伐:20:16:1.10:0:120"),
            ]
        ),
        EventSpec(
            id: "li_mu_xiongnu_244bce",
            scenarioIds: ["zhanguo_260bce"],
            triggerYear: -244, triggerMonth: 8, minDay: 600,
            title: "李牧大破匈奴 · 雁门十余年不敢近边",
            headline: "战国名将李牧蓄势诱敌，一战歼灭匈奴十万骑兵！",
            dateLabel: "公元前 244 年",
            body: "赵将李牧镇守代郡雁门，数年示弱养兵，一朝引匈奴主力深入口袋阵，战车劲弩骑兵齐发大破单于，漠北骑兵十余年不敢南窥赵边！",
            effectSummary: "赵国获 180 日【名将李牧镇边】（进攻 +28%、防御 +32%）、士气 +25。",
            illustration: "scroll_guandu_200",
            actorSpecId: "zhao", targetSpecId: "xiongnu",
            choices: [
                Choice(title: "李牧诱敌合围大破匈奴（史实）", subtitle: "赵国北疆安如磐石", isHistorical: true, effectCode: "buff:zhao:李牧雁门大捷:28:32:1.18:0:180|morale:zhao:25|morale:xiongnu:-18"),
            ]
        ),
        EventSpec(
            id: "qi_tian_isolation_240bce",
            scenarioIds: ["zhanguo_260bce"],
            triggerYear: -240, triggerMonth: 3, minDay: 720,
            title: "齐国厚商避战 · 临淄繁华甲天下",
            headline: "齐王建听信后胜远交秦国，临淄海盐鱼铁富甲海内",
            dateLabel: "公元前 240 年",
            body: "秦国行远交近攻重金贿赂齐相后胜，齐国数十年不涉三晋兵戈，临淄城内车毂击、人肩摩，然唇亡齿寒之患已暗伏于西疆。",
            effectSummary: "齐国国库 +500、与秦缔结互不侵犯条约；若选架空可出兵合纵抗秦！",
            illustration: "scroll_silkroad_peace",
            actorSpecId: "qi", targetSpecId: "qin",
            choices: [
                Choice(title: "远交强秦 · 临淄富商自保（史实）", subtitle: "齐国暂免战火且财赋充盈", isHistorical: true, effectCode: "gold:qi:500|pact:qi:qin:3"),
                Choice(title: "醒悟唇亡齿寒 · 出兵西援合纵（架空）", subtitle: "齐国精锐技击士全线驰援关东", isHistorical: false, effectCode: "ally:zhao:qi|war:qi:qin:1|buff:qi:齐鲁技击出征:26:16:1.15:0:150"),
            ]
        ),
        EventSpec(
            id: "jing_ke_227bce",
            scenarioIds: ["zhanguo_260bce"],
            triggerYear: -227, triggerMonth: 10, minDay: 960,
            title: "风萧萧兮易水寒 · 荆轲刺秦王",
            headline: "图穷匕见震动咸阳殿！秦王嬴政震怒，王翦大军直扑蓟城",
            dateLabel: "公元前 227 年",
            body: "燕太子丹孤注一掷遣侠士荆轲携督亢地图入咸阳行刺秦王，图穷匕见功败垂成，秦王震怒之下命王翦率十万大军北击燕国！",
            effectSummary: "秦国获 150 日【扫平六合天威】（进攻 +36%、行军 ×1.25）并向燕国宣战。",
            illustration: "scroll_changping_260bce",
            actorSpecId: "qin", targetSpecId: "yan",
            choices: [
                Choice(title: "图穷匕见 · 秦军怒伐燕赵（史实）", subtitle: "大秦一统车轮不可阻挡", isHistorical: true, effectCode: "war:qin:yan:1|buff:qin:横扫六合天威:36:14:1.25:0:150|morale:qin:24"),
            ]
        ),
        EventSpec(
            id: "wang_jian_chu_224bce",
            scenarioIds: ["zhanguo_260bce"],
            triggerYear: -224, triggerMonth: 5, minDay: 1120,
            title: "王翦六十万大军伐楚 · 项燕死战淮南",
            headline: "大秦倾国之力南下决战！江淮楚地迎来战国终局对决",
            dateLabel: "公元前 224 年",
            body: "名将王翦请兵六十万坚壁休整，一朝楚军东移便倾巢追击；楚将项燕高呼「楚虽三户，亡秦必楚」率江淮子弟殊死抗秦！",
            effectSummary: "秦楚爆发终局决战，秦获【王翦六十万精师】、楚获【三户死志】。",
            illustration: "event_chibi_208",
            actorSpecId: "qin", targetSpecId: "chu",
            choices: [
                Choice(title: "王翦南征 · 决战大楚江淮（史实）", subtitle: "战国七雄迎来最后决胜时刻", isHistorical: true, effectCode: "war:qin:chu:1|buff:qin:王翦伐楚大军:32:18:1.18:0:180|buff:chu:江淮楚军死志:18:28:1.05:0:150"),
            ]
        ),

        // --- 三国鼎立 · 赤壁风云（公元 208 年 · 8 条） ---
        EventSpec(
            id: "chibi_208",
            scenarioIds: ["sanguo_208"],
            triggerYear: 208, triggerMonth: 11, minDay: 25,
            title: "赤壁之战 · 东风火攻",
            headline: "周瑜诸葛亮联手借东风火烧连环船！三分天下大势定鼎",
            dateLabel: "建安十三年冬（208 年）",
            body: "曹军水师不习水战以铁索连舟，孙权与刘备结成江东荆楚联军，黄盖诈降火攻赤壁，北军精锐顿遭重创，三分天下大势由此定鼎！",
            effectSummary: "孙吴与刘备锁定【孙刘联军】并获 150 日【赤壁水战火攻】加成（海战 +40%、防御 +28%）。",
            illustration: "event_chibi_208",
            actorSpecId: "sunwu", targetSpecId: "caowei",
            choices: [
                Choice(title: "孙刘结盟 · 火烧赤壁（史实）", subtitle: "孙刘联军获水战火攻奇效，抵御曹魏南下", isHistorical: true, effectCode: "ally:sunwu:liubei|buff:sunwu:赤壁火攻:26:28:1.15:40:150|buff:liubei:联吴抗曹:24:26:1.15:0:150|morale:caowei:-15"),
                Choice(title: "江东举州归降曹丞相（架空）", subtitle: "东吴称臣曹操，天下一统提前降临", isHistorical: false, effectCode: "vassal:caowei:sunwu|peace:caowei:sunwu"),
            ]
        ),
        EventSpec(
            id: "hefei_zhangliao_209",
            scenarioIds: ["sanguo_208"],
            triggerYear: 209, triggerMonth: 4, minDay: 120,
            title: "张辽威震逍遥津 · 曹魏固守淮南",
            headline: "八百虎骑冲垮江东十万大阵，小儿闻「张辽」之名不敢夜啼！",
            dateLabel: "建安十四年（209 年）",
            body: "赤壁战后孙权乘胜北伐合肥，曹魏大将张辽率八百敢死精锐突袭东吴中军大营，几擒孙权，稳固了曹魏在江淮防线的钢铁壁垒。",
            effectSummary: "曹魏获 150 日【张辽威震合肥】（防御 +32%、进攻 +24%）、士气 +22。",
            illustration: "scroll_guandu_200",
            actorSpecId: "caowei", targetSpecId: "sunwu",
            choices: [
                Choice(title: "八百死士破敌 · 稳固合肥（史实）", subtitle: "曹魏重振江淮防线军威", isHistorical: true, effectCode: "buff:caowei:张辽威震逍遥津:24:32:1.16:0:150|morale:caowei:22"),
            ]
        ),
        EventSpec(
            id: "tongguan_machao_211",
            scenarioIds: ["sanguo_208"],
            triggerYear: 211, triggerMonth: 7, minDay: 320,
            title: "潼关之战 · 西凉铁骑决战曹操",
            headline: "锦马超率凉州铁骑杀得曹操割须弃袍，贾诩离间计定关中！",
            dateLabel: "建安十六年（211 年）",
            body: "西凉马超、韩遂率十万关西联军据守潼关反曹，铁骑冲锋一度逼得曹操危在旦夕；最终贾诩巧施抹书离间计，曹魏一举平定关中陇右！",
            effectSummary: "曹魏与西凉马腾爆发大战；西凉获【锦马超西凉铁骑】，曹魏获【贾诩离间计】。",
            illustration: "scroll_guandu_200",
            actorSpecId: "caowei", targetSpecId: "mateng",
            choices: [
                Choice(title: "西征关中 · 潼关大决战（史实）", subtitle: "曹操挥师西进平定凉州隐患", isHistorical: true, effectCode: "war:caowei:mateng:1|buff:caowei:贾诩离间破敌:26:16:1.18:0:150|buff:mateng:西凉铁骑冲锋:30:10:1.25:0:120"),
            ]
        ),
        EventSpec(
            id: "liubei_enter_shu_212",
            scenarioIds: ["sanguo_208"],
            triggerYear: 212, triggerMonth: 10, minDay: 460,
            title: "刘备入蜀 · 龙盘天府巴蜀",
            headline: "法正庞统献计取益州！刘备挥师西进直指成都",
            dateLabel: "建安十七年（212 年）",
            body: "为践行诸葛亮《隆中对》「跨有荆益」大计，刘备率黄忠、魏延、诸葛亮、张飞、赵云诸名将兵进西川，与益州刘璋决裂争夺天府之国！",
            effectSummary: "刘备向益州刘璋宣战并获 180 日【隆中对·取蜀精兵】（进攻 +30%、行军 ×1.20）。",
            illustration: "scroll_changping_260bce",
            actorSpecId: "liubei", targetSpecId: "liuzhang",
            choices: [
                Choice(title: "挥师入蜀 · 践行隆中对（史实）", subtitle: "攻取天府之国，奠定季汉根基", isHistorical: true, effectCode: "war:liubei:liuzhang:1|buff:liubei:隆中对·入蜀精师:30:18:1.20:0:180|morale:liubei:22"),
                Choice(title: "与刘璋结为汉室宗亲盟友（架空）", subtitle: "益荆同盟共同北伐曹魏", isHistorical: false, effectCode: "ally:liubei:liuzhang|gold:liubei:300"),
            ]
        ),
        EventSpec(
            id: "hanzhong_215",
            scenarioIds: ["sanguo_208"],
            triggerYear: 215, triggerMonth: 7, minDay: 680,
            title: "定军山与汉中之战 · 黄忠斩夏侯渊",
            headline: "法正奇谋居高临下！刘备力挫曹操夺取汉中，进位汉中王",
            dateLabel: "建安二十年（215 年）",
            body: "汉中乃益州咽喉、关中门户。曹魏与刘备在此展开生死角逐，老将黄忠于定军山一刀斩落夏侯渊，刘备威震天下进位汉中王！",
            effectSummary: "曹魏进攻张鲁或汉中，刘备获 150 日【定军山奇功】（进攻 +28%、防御 +24%）。",
            illustration: "scroll_guandu_200",
            actorSpecId: "caowei", targetSpecId: "zhanglu",
            choices: [
                Choice(title: "争夺汉中咽喉 · 群雄会战秦岭（史实）", subtitle: "汉中成为魏蜀必争之地", isHistorical: true, effectCode: "war:caowei:zhanglu:1|buff:liubei:定军山汉中王:28:24:1.15:0:150|buff:caowei:秦岭南征:22:18:1.10:0:150"),
            ]
        ),
        EventSpec(
            id: "fan_castle_219",
            scenarioIds: ["sanguo_208"],
            triggerYear: 219, triggerMonth: 8, minDay: 920,
            title: "关羽水淹七军 · 威震华夏！",
            headline: "汉水秋汛破于禁庞德，曹操一度欲迁都避其锋芒！",
            dateLabel: "建安二十四年（219 年）",
            body: "关羽统率荆州水陆大军北伐襄樊，趁汉水暴涨水淹曹魏七军、生擒于禁、斩杀庞德，天下震动！然吕蒙白衣渡江已暗伏江陵背后。",
            effectSummary: "刘备获 120 日【武圣水淹七军】（进攻 +36%、士气 +28）；曹魏急调徐晃援救。",
            illustration: "event_chibi_208",
            actorSpecId: "liubei", targetSpecId: "caowei",
            choices: [
                Choice(title: "北伐襄樊 · 水淹七军威震华夏（史实）", subtitle: "荆州铁骑锋芒毕露直逼许昌", isHistorical: true, effectCode: "buff:liubei:水淹七军威震华夏:36:14:1.22:0:120|morale:liubei:28|buff:caowei:徐晃长驱解围:22:24:1.12:0:120"),
            ]
        ),
        EventSpec(
            id: "shixie_lingnan_210",
            scenarioIds: ["sanguo_208"],
            triggerYear: 210, triggerMonth: 6, minDay: 220,
            title: "交州通海市舶 · 士燮保境安民",
            headline: "中原板荡独岭南晏然！南海胡商云集番禺交趾",
            dateLabel: "建安十五年（210 年）",
            body: "中原大乱之际，交趾太守士燮崇尚儒学、安抚百越，岭南与交州衣冠士人云集、海外商船络绎不绝，富庶一方。",
            effectSummary: "交州士燮国库 +420、防御 +22%，与孙吴交好通商。",
            illustration: "scroll_silkroad_peace",
            actorSpecId: "shixie", targetSpecId: "sunwu",
            choices: [
                Choice(title: "保境安民 · 兴南海通商（史实）", subtitle: "交州财赋丰厚、边海稳固", isHistorical: true, effectCode: "gold:shixie:420|buff:shixie:交州安境通商:8:22:1.0:18:240|pact:shixie:sunwu:3"),
            ]
        ),
        EventSpec(
            id: "tuntian_caowei_214",
            scenarioIds: ["sanguo_208"],
            triggerYear: 214, triggerMonth: 3, minDay: 580,
            title: "曹魏屯田大兴 · 许下军粮丰盈",
            headline: "枣祗韩浩大行民屯军屯，中原流民归农仓库充实",
            dateLabel: "建安十九年（214 年）",
            body: "曹操广兴屯田，数年之间中原州郡仓廪皆满，彻底解决了大军连年征战的军粮后勤难题，奠定了北方霸主雄厚国力。",
            effectSummary: "曹魏国库 +520、全军士气 +16、长效补给强化。",
            illustration: "scroll_silkroad_peace",
            actorSpecId: "caowei", targetSpecId: nil,
            choices: [
                Choice(title: "大兴屯田 · 充实中原粮仓（史实）", subtitle: "曹魏财赋兵粮冠绝天下", isHistorical: true, effectCode: "gold:caowei:520|morale:caowei:16|buff:caowei:许下屯田丰盈:14:16:1.05:0:200"),
            ]
        ),

        // --- 盛唐天宝（公元 755 年 · 7 条） ---
        EventSpec(
            id: "anshi_755",
            scenarioIds: ["tang_755"],
            triggerYear: 755, triggerMonth: 11, minDay: 18,
            title: "渔阳鼙鼓动地来 · 安史之乱震动海内",
            headline: "范阳铁骑南下惊破霓裳羽衣曲，郭子仪李光弼临危受命平叛！",
            dateLabel: "天宝十四载冬（755 年 12 月）",
            body: "平卢范阳河东三镇动乱惊破开元天宝盛世，长安震动！朔方名将郭子仪、李光弼火速东出井陉，张巡许远死守睢阳，誓死护卫大唐江山！",
            effectSummary: "大唐紧急总动员获 180 日【朔方忠义平叛】（防御 +28%、进攻 +22%），吐蕃与南诏乘机窥边。",
            illustration: "scroll_anshi_755",
            actorSpecId: "tang", targetSpecId: "tibet",
            choices: [
                Choice(title: "起用郭子仪李光弼 · 联回纥稳中原（史实）", subtitle: "大唐与回纥同盟共抗强敌，死守关中江淮", isHistorical: true, effectCode: "ally:tang:uyghur|buff:tang:朔方平叛忠勇:22:28:1.10:0:180|buff:tibet:吐蕃乘虚东进:24:12:1.15:0:150|war:tibet:tang:1"),
                Choice(title: "盛唐兵锋不减 · 先西击吐蕃稳河陇（架空）", subtitle: "哥舒翰潼关出击，全线反推吐蕃", isHistorical: false, effectCode: "buff:tang:天宝铁骑西征:30:18:1.18:0:180|war:tang:tibet:1"),
            ]
        ),
        EventSpec(
            id: "sui_yang_757",
            scenarioIds: ["tang_755"],
            triggerYear: 757, triggerMonth: 5, minDay: 150,
            title: "张巡死守睢阳 · 遮蔽江淮财赋",
            headline: "「宁为鬼雄，不降贼手！」江淮百万漕粮安然运抵关中",
            dateLabel: "至德二载（757 年）",
            body: "张巡、许远以数千孤军死守睢阳十月，保住了大唐富庶的江南财赋之源，使朝廷得以源源不断筹措军饷光复两京！",
            effectSummary: "大唐国库 +480、士气 +24、获 150 日【江淮漕运稳固】防御加成。",
            illustration: "scroll_anshi_755",
            actorSpecId: "tang", targetSpecId: nil,
            choices: [
                Choice(title: "守住江淮财源 · 诏赏忠烈（史实）", subtitle: "大唐国库与军心大振", isHistorical: true, effectCode: "gold:tang:480|morale:tang:24|buff:tang:睢阳铁壁:14:30:1.0:0:150"),
            ]
        ),
        EventSpec(
            id: "uyghur_cavalry_757",
            scenarioIds: ["tang_755"],
            triggerYear: 757, triggerMonth: 9, minDay: 240,
            title: "唐回盟约 · 漠北铁骑驰援长安",
            headline: "葛勒可汗遣叶护太子率精骑南下，唐回联军气势如虹",
            dateLabel: "至德二载秋（757 年）",
            body: "回纥可汗信守和亲盟约，遣数千铁骑与朔方唐军并肩作战，漠北弯刀与大唐陌刀横扫沙场！",
            effectSummary: "大唐与回纥锁定同盟，各获 150 日【唐回铁骑协同】加成，回纥获丝绢岁币 +380。",
            illustration: "scroll_silkroad_peace",
            actorSpecId: "uyghur", targetSpecId: "tang",
            choices: [
                Choice(title: "回纥铁骑南援 · 绢马互市（史实）", subtitle: "唐回双赢，共保丝路通畅", isHistorical: true, effectCode: "ally:tang:uyghur|gold:uyghur:380|buff:uyghur:漠北铁骑驰援:28:12:1.22:0:150|buff:tang:收复两京锐气:24:18:1.12:0:150"),
            ]
        ),
        EventSpec(
            id: "tibet_hexi_763",
            scenarioIds: ["tang_755"],
            triggerYear: 763, triggerMonth: 10, minDay: 480,
            title: "吐蕃雄霸雪域 · 河陇丝路争衡",
            headline: "赤松德赞厉兵秣马，吐蕃铁骑东出青海直逼关中！",
            dateLabel: "广德元年（763 年）",
            body: "吐蕃赞普赤松德赞励精图治，国力达至鼎盛，大军沿河西走廊东进与大唐展开长达数十年的河陇拉锯战。",
            effectSummary: "吐蕃获 180 日【雪域铁骑东出】（进攻 +30%、行军 ×1.20）并与大唐激战。",
            illustration: "scroll_anshi_755",
            actorSpecId: "tibet", targetSpecId: "tang",
            choices: [
                Choice(title: "吐蕃精锐东出争锋河陇（史实）", subtitle: "青藏高原霸主展现巅峰军力", isHistorical: true, effectCode: "war:tibet:tang:1|buff:tibet:雪域赞普雄师:30:18:1.20:0:180|morale:tibet:22"),
            ]
        ),
        EventSpec(
            id: "nanzhao_alliance_756",
            scenarioIds: ["tang_755"],
            triggerYear: 756, triggerMonth: 6, minDay: 95,
            title: "南诏吐蕃结盟 · 洱海风云起",
            headline: "阁罗凤立《南诏德化碑》，西南险隘严阵以待",
            dateLabel: "至德元载（756 年）",
            body: "南诏王阁罗凤在大理太和城整合六诏兵力，既通吐蕃又敬汉学，雄踞苍山洱海成为西南不可忽视的劲旅。",
            effectSummary: "南诏获 180 日【苍山洱海险隘】（防御 +32%、进攻 +18%），可选择联蕃或归唐。",
            illustration: "scroll_silkroad_peace",
            actorSpecId: "nanzhao", targetSpecId: "tibet",
            choices: [
                Choice(title: "南诏吐蕃联手制衡西南（史实）", subtitle: "吐蕃南诏结盟，西南防线大固", isHistorical: true, effectCode: "ally:tibet:nanzhao|buff:nanzhao:洱海山地精兵:18:32:1.10:0:180"),
                Choice(title: "南诏重修唐好 · 归附长安（架空）", subtitle: "贞元归唐提前三十年实现", isHistorical: false, effectCode: "ally:tang:nanzhao|gold:nanzhao:300"),
            ]
        ),
        EventSpec(
            id: "bohai_haidong_758",
            scenarioIds: ["tang_755"],
            triggerYear: 758, triggerMonth: 4, minDay: 290,
            title: "渤海国迁都上京 · 「海东盛国」崛起",
            headline: "大钦茂效法长安规制营建龙泉府，白山黑水文教鼎盛",
            dateLabel: "乾元元年（758 年）",
            body: "渤海文王大钦茂营建壮丽的上京龙泉府，广派遣唐使学习礼乐典章，经由渤海湾与日本海开展繁盛海贸，获誉「海东盛国」！",
            effectSummary: "渤海国国库 +420、获 180 日【海东盛国】攻防与海贸加成。",
            illustration: "scroll_silkroad_peace",
            actorSpecId: "bohai", targetSpecId: "tang",
            choices: [
                Choice(title: "兴建上京龙泉府 · 朝贡通商（史实）", subtitle: "渤海国财赋与国力蒸蒸日上", isHistorical: true, effectCode: "gold:bohai:420|buff:bohai:海东盛国兴盛:16:22:1.08:18:180|pact:bohai:tang:3"),
            ]
        ),
        EventSpec(
            id: "abbasid_silkroad_759",
            scenarioIds: ["tang_755"],
            triggerYear: 759, triggerMonth: 7, minDay: 360,
            title: "黑衣大食西域商路与造纸西传",
            headline: "撒马尔罕驼铃绵延万里，阿拔斯王朝坐拥东西方贸易枢纽",
            dateLabel: "乾元二年（759 年）",
            body: "怛罗斯战役后东西两大帝国渐趋和缓，中国造纸术经河中传遍伊斯兰世界，丝绸之路商队络绎不绝。",
            effectSummary: "黑衣大食国库 +460、士气 +16，西域骑兵战备充实。",
            illustration: "scroll_silkroad_peace",
            actorSpecId: "abbasid", targetSpecId: "tang",
            choices: [
                Choice(title: "通商丝路 · 兴盛河中（史实）", subtitle: "大食财赋殷实，骑兵精锐", isHistorical: true, effectCode: "gold:abbasid:460|morale:abbasid:16|buff:abbasid:阿拔斯丝路铁骑:22:18:1.15:0:180"),
            ]
        ),

        // --- 宋金对峙 · 绍兴和议（公元 1142 年 · 7 条） ---
        EventSpec(
            id: "shaoxing_truce_1142",
            scenarioIds: ["song_jin_1142"],
            triggerYear: 1142, triggerMonth: 5, minDay: 15,
            title: "绍兴和议初定 · 宋金划淮分治",
            headline: "东起淮水西至大散关，南北对峙进入二十年暗战休整期",
            dateLabel: "绍兴十二年（1142 年）",
            body: "宋金达成绍兴和议，南宋休养生息兴盛临安市舶海贸，大金则推行汉制改革、屯兵中原，双方都在暗中积蓄下一次决战的国力！",
            effectSummary: "南宋获市舶岁入 +450 与江淮防线加成；金朝获中原财赋 +420。",
            illustration: "scroll_yancheng_1140",
            actorSpecId: "nsong", targetSpecId: "jin",
            choices: [
                Choice(title: "休养生息 · 广开泉州临安市舶（史实）", subtitle: "南宋财政富甲天下，水师强盛", isHistorical: true, effectCode: "gold:nsong:450|gold:jin:420|buff:nsong:江南市舶富庶:10:24:1.0:25:200|pact:nsong:jin:2"),
                Choice(title: "拒绝屈辱和议 · 岳家军余部立刻北伐（架空）", subtitle: "大宋铁骑重渡淮河直捣汴京！", isHistorical: false, effectCode: "war:nsong:jin:1|buff:nsong:直捣黄龙壮志:32:18:1.20:0:180|morale:nsong:28"),
            ]
        ),
        EventSpec(
            id: "jin_move_yanjing_1153",
            scenarioIds: ["song_jin_1142"],
            triggerYear: 1145, triggerMonth: 3, minDay: 210,
            title: "大金迁都燕京中都 · 铁浮屠重整军备",
            headline: "完颜氏大兴土木定鼎燕京，女真铁骑与汉地重甲严阵以待",
            dateLabel: "金皇统年间",
            body: "金廷将政治中心南迁燕京中都，加速吸收中原典章与冶铁工艺，打造出威震南北的重装铁浮屠与拐子马骑兵集群。",
            effectSummary: "金朝国库 +400、获 180 日【中都铁浮屠】（进攻 +28%、行军 ×1.18）。",
            illustration: "scroll_yancheng_1140",
            actorSpecId: "jin", targetSpecId: "nsong",
            choices: [
                Choice(title: "定鼎燕京 · 扩编铁浮屠重骑（史实）", subtitle: "金军南下实力大增", isHistorical: true, effectCode: "gold:jin:400|buff:jin:燕京铁浮屠:28:14:1.18:0:180|morale:jin:20"),
            ]
        ),
        EventSpec(
            id: "mongol_khabul_1146",
            scenarioIds: ["song_jin_1142"],
            triggerYear: 1146, triggerMonth: 8, minDay: 320,
            title: "漠北雄鹰崛起 · 蒙古诸部大败金军",
            headline: "合不勒汗统率草原铁骑纵横斡难河，大金北疆烽烟骤起！",
            dateLabel: "1146 年",
            body: "蒙古乞颜部在漠北草原迅速壮大，骑射精锐屡破金国边防界壕，大金被迫在北疆投入重兵防备草原雄狮。",
            effectSummary: "蒙古诸部获 200 日【漠北苍狼骑射】（进攻 +34%、行军 ×1.28）、士气 +25。",
            illustration: "scroll_guandu_200",
            actorSpecId: "mongol", targetSpecId: "jin",
            choices: [
                Choice(title: "草原铁骑南掠金边（史实）", subtitle: "蒙古骑兵机动与锐气冠绝塞北", isHistorical: true, effectCode: "war:mongol:jin:1|buff:mongol:漠北苍狼铁骑:34:14:1.28:0:200|morale:mongol:25"),
            ]
        ),
        EventSpec(
            id: "caishi_1161",
            scenarioIds: ["song_jin_1142"],
            triggerYear: 1148, triggerMonth: 11, minDay: 480,
            title: "采石矶大捷 · 虞允文火器车船破金兵",
            headline: "霹雳炮震响长江！书生虞允文指挥宋军车船水师大破完颜亮！",
            dateLabel: "采石江防决战",
            body: "金兵六十万倾巢南渡长江，千钧一发之际中书舍人虞允文临危统兵，以踏车海鳅战船与霹雳火药炮猛轰金军渡船，一战粉碎大金灭宋野心！",
            effectSummary: "南宋获 180 日【采石霹雳水师】（海战 +42%、防御 +32%、进攻 +22%）。",
            illustration: "event_chibi_208",
            actorSpecId: "nsong", targetSpecId: "jin",
            choices: [
                Choice(title: "霹雳炮轰沉金军渡船 · 大捷采石矶（史实）", subtitle: "大宋长江天堑固若金汤", isHistorical: true, effectCode: "war:jin:nsong:1|buff:nsong:采石矶霹雳水师:22:32:1.10:42:180|morale:nsong:28"),
            ]
        ),
        EventSpec(
            id: "xixia_tiancheng_1149",
            scenarioIds: ["song_jin_1142"],
            triggerYear: 1149, triggerMonth: 5, minDay: 560,
            title: "夏仁宗兴文治 · 铁鹞子守卫河西",
            headline: "西夏颁行《天盛律令》，重甲铁鹞子与步跋子威镇贺兰山",
            dateLabel: "天盛年间",
            body: "夏仁宗李仁孝尊崇文教、颁行法典，国力达至西夏历史巅峰，精锐「铁鹞子」重骑控扼丝绸之路咽喉财源滚滚。",
            effectSummary: "西夏国库 +380、获 180 日【铁鹞子重骑】（防御 +28%、进攻 +22%）。",
            illustration: "scroll_silkroad_peace",
            actorSpecId: "xixia", targetSpecId: nil,
            choices: [
                Choice(title: "颁行天盛律令 · 整编铁鹞子（史实）", subtitle: "西夏河西霸业鼎盛", isHistorical: true, effectCode: "gold:xixia:380|buff:xixia:铁鹞子河西劲旅:22:28:1.12:0:180"),
            ]
        ),
        EventSpec(
            id: "goryeo_sea_trade_1150",
            scenarioIds: ["song_jin_1142"],
            triggerYear: 1150, triggerMonth: 8, minDay: 640,
            title: "高丽青瓷远渡明州 · 宋丽海贸兴盛",
            headline: "碧澜渡帆影蔽海，高丽与南宋跨越黄海商船如织",
            dateLabel: "1150 年",
            body: "高丽王朝开京碧澜渡与南宋明州（宁波）之间海贸繁盛，高丽青瓷与大宋雕版典籍互通有无，两国国库皆大为充实。",
            effectSummary: "高丽与南宋各获国库 +320、缔结友好通商条约。",
            illustration: "scroll_silkroad_peace",
            actorSpecId: "goryeo", targetSpecId: "nsong",
            choices: [
                Choice(title: "广通明州海贸（史实）", subtitle: "宋丽海上航路繁荣富庶", isHistorical: true, effectCode: "gold:goryeo:320|gold:nsong:320|pact:goryeo:nsong:3"),
            ]
        ),
        EventSpec(
            id: "dali_tea_horse_1151",
            scenarioIds: ["song_jin_1142"],
            triggerYear: 1151, triggerMonth: 4, minDay: 720,
            title: "滇川茶马互市 · 大理骏马驰援大宋",
            headline: "西南茶马古道铃声不断，大理良马源源不断输往巴蜀",
            dateLabel: "1151 年",
            body: "南宋失却北方牧场后，西南大理良马成为宋军骑兵的珍贵源泉，滇川茶马互市令大理与南宋皆获丰厚收益。",
            effectSummary: "大理与南宋各获国库 +300，南宋骑兵战力提升。",
            illustration: "scroll_silkroad_peace",
            actorSpecId: "dali", targetSpecId: "nsong",
            choices: [
                Choice(title: "繁荣茶马古道互市（史实）", subtitle: "宋理睦邻互惠，西南安泰", isHistorical: true, effectCode: "gold:dali:300|gold:nsong:300|buff:dali:大理茶马富庶:12:24:1.05:0:180"),
            ]
        ),

        // --- 日本战国 · 桶狭间（公元 1560 年 · 8 条） ---
        EventSpec(
            id: "okehazama_1560",
            scenarioIds: ["sengoku_1560"],
            triggerYear: 1560, triggerMonth: 5, minDay: 10,
            title: "桶狭间奇袭 · 暴风雨中斩落东海道第一弓取",
            headline: "「人生五十年，如梦亦如幻！」织田信长三千奇兵暴雨突袭今川本阵！",
            dateLabel: "永禄三年五月十九日（1560 年）",
            body: "今川义元统率两万五千大军浩荡上洛，尾张小大名织田信长孤注一掷，趁倾盆暴雨直扑桶狭间洼地斩杀今川义元，一战震惊日本列岛！",
            effectSummary: "织田家获 180 日【桶狭间暴雨奇袭】（进攻 +38%、行军 ×1.28、士气 +30）；今川家士气暴跌。",
            illustration: "event_sengoku_gun",
            actorSpecId: "oda", targetSpecId: "imagawa",
            choices: [
                Choice(title: "暴雨奇袭桶狭间本阵（史实）", subtitle: "以三千破两万五千，织田霸业由此启程", isHistorical: true, effectCode: "buff:oda:桶狭间奇袭神威:38:14:1.28:0:180|morale:oda:30|morale:imagawa:-25|war:oda:imagawa:0"),
                Choice(title: "清洲笼城死守待援（架空）", subtitle: "稳健固守尾张城池，静观其变", isHistorical: false, effectCode: "buff:oda:清洲笼城死守:10:34:1.0:0:150"),
            ]
        ),
        EventSpec(
            id: "kawanakajima_1561",
            scenarioIds: ["sengoku_1560"],
            triggerYear: 1561, triggerMonth: 9, minDay: 95,
            title: "第四次川中岛合战 · 龙虎雾中单骑决战",
            headline: "啄木鸟战法对车悬之阵！上杉谦信挥刀直砍武田信玄帅扇！",
            dateLabel: "永禄四年九月（1561 年）",
            body: "越后之龙上杉谦信看破武田军师山本勘助的「啄木鸟战法」，大雾散尽之际摆出车悬之阵直扑八幡原，与甲斐之虎武田信玄展开日本战国最传奇的一战！",
            effectSummary: "武田家获【风林火山】、上杉家获【毘沙门天车悬阵】双雄巅峰加成！",
            illustration: "scroll_sekigahara_1600",
            actorSpecId: "takeda", targetSpecId: "uesugi",
            choices: [
                Choice(title: "龙虎血战八幡原（史实）", subtitle: "风林火山与车悬之阵名震天下", isHistorical: true, effectCode: "war:takeda:uesugi:1|buff:takeda:风林火山赤备:30:22:1.22:0:180|buff:uesugi:越后之龙车悬阵:34:18:1.25:0:180|morale:takeda:22|morale:uesugi:22"),
            ]
        ),
        EventSpec(
            id: "mino_conquest_1567",
            scenarioIds: ["sengoku_1560"],
            triggerYear: 1562, triggerMonth: 8, minDay: 220,
            title: "稻叶山攻防与「天下布武」朱印",
            headline: "美浓攻略大成！织田信长改名岐阜，颁行乐市乐座富国强兵",
            dateLabel: "美浓攻略",
            body: "织田信长历经数年苦战终克斋藤家险峻的稻叶山城，改称「岐阜」并启用「天下布武」朱印，废除关卡垄断实行乐市乐座，尾张美浓财赋激增！",
            effectSummary: "织田家向斋藤家宣战并获 180 日【天下布武·乐市乐座】（进攻 +28%、国库 +360）。",
            illustration: "event_sengoku_gun",
            actorSpecId: "oda", targetSpecId: "saito",
            choices: [
                Choice(title: "攻略美浓 · 推行乐市乐座（史实）", subtitle: "织田开启上洛统一天下之路", isHistorical: true, effectCode: "war:oda:saito:0|gold:oda:360|buff:oda:天下布武·乐市乐座:28:16:1.20:0:180"),
            ]
        ),
        EventSpec(
            id: "itsukushima_mori_1563",
            scenarioIds: ["sengoku_1560"],
            triggerYear: 1563, triggerMonth: 5, minDay: 300,
            title: "毛利元就三箭之训 · 制霸中国地方",
            headline: "毛利水军纵横濑户内海，吉田郡山号令山阳山阴十国！",
            dateLabel: "永禄六年（1563 年）",
            body: "谋神毛利元就以「三支箭」教诲诸子同心协力，凭借精锐村上水军牢控濑户内海制海权，稳坐中国地方第一大名宝座。",
            effectSummary: "毛利家获 180 日【三箭同心·濑户水军】（海战 +35%、防御 +24%、国库 +320）。",
            illustration: "scroll_sekigahara_1600",
            actorSpecId: "mori", targetSpecId: nil,
            choices: [
                Choice(title: "三箭同心 · 雄踞中国十国（史实）", subtitle: "毛利陆海兼备，声威大振", isHistorical: true, effectCode: "gold:mori:320|buff:mori:毛利三箭水军:22:24:1.12:35:180|morale:mori:20"),
            ]
        ),
        EventSpec(
            id: "odawara_hojo_1564",
            scenarioIds: ["sengoku_1560"],
            triggerYear: 1564, triggerMonth: 4, minDay: 380,
            title: "相模狮子北条氏康 · 关东民政与小田原巨城",
            headline: "四公六民仁政得民心，小田原总构城郭坚不可摧！",
            dateLabel: "永禄七年（1564 年）",
            body: "北条氏康在关东八州施行轻徭薄赋的善政，并修筑延绵数里的小田原巨型防御城郭，屡屡击退上杉、武田名将围攻。",
            effectSummary: "北条家获 200 日【小田原难攻不落】（防御 +36%、国库 +340）。",
            illustration: "scroll_sekigahara_1600",
            actorSpecId: "hojo", targetSpecId: nil,
            choices: [
                Choice(title: "固守关东善政与小田原巨城（史实）", subtitle: "相模狮子根基稳固如山", isHistorical: true, effectCode: "gold:hojo:340|buff:hojo:小田原难攻不落:16:36:1.05:0:200|morale:hojo:20"),
            ]
        ),
        EventSpec(
            id: "shimazu_kyushu_1565",
            scenarioIds: ["sengoku_1560"],
            triggerYear: 1565, triggerMonth: 7, minDay: 460,
            title: "萨摩铁炮与钓野伏 · 岛津四兄弟横扫九州",
            headline: "种子岛火绳枪率先装备萨摩武士，岛津家吹响统一九州号角！",
            dateLabel: "永禄八年（1565 年）",
            body: "地处种子岛近邻的岛津家最早大规模列装铁炮，结合凶悍的「钓野伏」伏击战术，岛津四兄弟挥师北上与大友、龙造寺逐鹿九州！",
            effectSummary: "岛津家获 180 日【萨摩钓野伏铁炮】（进攻 +34%、防御 +20%），九州争霸白热化。",
            illustration: "event_sengoku_gun",
            actorSpecId: "shimazu", targetSpecId: "otomo",
            choices: [
                Choice(title: "岛津北上 · 决战大友与龙造寺（史实）", subtitle: "萨摩精兵横扫九州南疆", isHistorical: true, effectCode: "war:shimazu:otomo:0|buff:shimazu:萨摩钓野伏:34:20:1.18:0:180|morale:shimazu:24"),
            ]
        ),
        EventSpec(
            id: "honnoji_1582",
            scenarioIds: ["sengoku_1560"],
            triggerYear: 1568, triggerMonth: 6, minDay: 600,
            title: "长筱铁炮三段击 · 战国兵法大革新",
            headline: "三千铁炮队立栅齐射，火器时代彻底改写扶桑合战！",
            dateLabel: "战国火器革新",
            body: "尾张奇袭与铁炮三段击彻底改写日本战国兵法，各大名纷纷扩编铁炮常备军与职业足轻，逐鹿京都上洛之争进入终局高潮。",
            effectSummary: "织田家获得 180 日【天下布武·铁炮三段击】（进攻 +34%、行军 ×1.22）。",
            illustration: "event_sengoku_gun",
            actorSpecId: "oda", targetSpecId: nil,
            choices: [
                Choice(title: "推行铁炮三段击革新（史实）", subtitle: "织田军火力与机动大幅跃升", isHistorical: true, effectCode: "buff:oda:铁炮三段击:34:14:1.22:0:180|gold:oda:300"),
            ]
        ),
        EventSpec(
            id: "date_one_eyed_dragon_1570",
            scenarioIds: ["sengoku_1560"],
            triggerYear: 1570, triggerMonth: 5, minDay: 720,
            title: "独眼龙雄踞奥羽 · 伊达骑马铁炮队",
            headline: "奥州霸主虎视关东，黑漆具足铁骑席卷东北大地！",
            dateLabel: "奥羽群雄时代",
            body: "伊达家整合奥羽诸豪强并组建精锐的骑马铁炮队，纵横仙台、米泽与虾夷海疆，蓄势南下问鼎中原！",
            effectSummary: "伊达家获 180 日【奥州独眼龙铁骑】（进攻 +30%、行军 ×1.24）、国库 +320。",
            illustration: "scroll_sekigahara_1600",
            actorSpecId: "date", targetSpecId: nil,
            choices: [
                Choice(title: "整编骑马铁炮队 · 经略奥羽（史实）", subtitle: "伊达家成为北日本霸主", isHistorical: true, effectCode: "gold:date:320|buff:date:独眼龙骑马铁炮:30:14:1.24:0:180|morale:date:22"),
            ]
        ),
    ]
}
