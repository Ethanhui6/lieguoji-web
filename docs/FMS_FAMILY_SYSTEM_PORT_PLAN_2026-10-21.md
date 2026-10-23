# 原作家族系统移植计划（第13步前置，2026-10-21）

用户决定：完全按原作移植家族系统，再做家族叛乱与内战。只对新建世界生效（新规则开关），旧世界保留网页“分封/婚育”规则与原存档。

## 原作结构（FantasyWorld.CharacterSystem.FamilyManager，144 个函数）

原作 Family 字段：surname、cultureName、patriarchId、heirId、founderId、memberIds、collateralMemberIds、allowFemaleInheritance、matrilinealSpouses、historicalClaims、originalHomeProvinceId、influence、wealth、homeProvinceId、controlledProvinces、extendedMembers、relations、totalEnemyDestroyed、totalProvincesConquered、historicalStateIds、lastRulingTime、rulingDuration、stateResidenceMonths、rallyCooldownTime、stateId、updateDay、isRulingFamily、religionId、foundingTime、color。

时间表（TimeManager.AdvanceOneDay）：
- 每月1日：FamilyManager.AssignRandomUpdateDays；FamilyManager.MonthlyUpdate（CheckProvinceControlConflicts → CheckFamilyRebellions → CheckCivilWarConditions）。
- 每日：FamilyManager.UpdateFamilies——到更新日的家族执行 UpdateFamilyDuration、ProcessSingleFamilyPopulation、ProcessSingleFamilyMarriage、UpdateSingleFamilyInfluence、MaintainCollateralBranches。
- 每年：FamilyManager.YearlyUpdate（UpdateFamilyHistoricalClaims）。
- State.AdvanceOneMonth：RedistributeTerritoriesForState。

开局（State.InitializeCharactersAndFamilies）：领袖 → 执政家族（20% 允许女性继承）→ 配偶、子女、旁支（网页已移植）→ AllocateRulingFamilyTerritories → GenerateNobleFamiliesWithTerritories（家族数按政体上限、按行省数调整，SelectOptimalFamilyOrigins 选起源省，CreateNobleFamilyWithTerritory + GenerateNobleFamilyMembers，AssignRemainingProvincesToNearestFamilies）→ ValidateAndAdjustInitialDistribution。

已读出的公式：
- 影响力 UpdateSingleFamilyInfluence：控制行省×20 + 成员×5 + 旁支×2 + 10 + 执政家族100 + log(max(1,财富))×10 + 族长特性影响力，限 0—1000。
- 关系 CalculateFamilyRelation：同国不同家族；存储关系 + 婚姻纽带 + 文化不同 −20 + 宗教相同 +10/不同 −15 + 地理修正 + 实力差修正 + （对方族长魅力−50）×0.5 + SocialButterfly 特性，限 ±100。
- 家族叛乱 ShouldFamilyRebel：非执政、有领地、影响力≥200、国家存活且可征服、距上次家族叛乱≥18月（天命保护×4）、与执政家族关系≤−50；几率 =|关系|/100×0.1 +（100−国运）/100×0.1 + 0.05，政体2/3 ×0.5、政体4 ×1.5，乘(1−领袖叛乱抵抗)。

## 批次
| 批 | 内容 | 状态 |
|---|---|---|
| F1 | 新世界家族规则开关与数据模型；开局执政家族领地、贵族家族与领地、剩余行省就近分配、初始分布校正 | 完成（afd703d6，源码检查点，未接界面） |
| F2 | 月/日/年调度：更新日、存续时长、影响力、旁支维护、领地控制冲突、历史宣称、领地再分配 | 完成（F2a 269459c2；F2b 本批） |
| F3 | 原作生育与婚姻、继承人与族长继承（替代网页婚育） | 完成（本批：生育、婚姻、灭绝、统治家族与王朝更迭） |
| F4 | 家族关系（婚姻纽带、地理、实力差）与战功 | 完成（战功按政体分配、失地家族命运五种结局） |
| F5 | 家族叛乱：判定、原因、复辟、号召、发动、结束文本 | 完成（0.5.1 补上复国 TryFamilyRestoration） |
| F6 | 内战：条件、类型、原因、发动、首都陷落内战、和约继承 | 完成（0.5.1 补复国与命名；首都陷落内战依附首都沦陷危机，待做） |
| F7 | 界面：家族面板、家族视图领地着色、AI全局配置 允许内战/允许家族叛乱与间隔 | 完成（家族面板含发动家族叛乱/发动内战；新世界默认开启待切换） |

每批：原作反汇编 → 网页移植 → 单元与浏览器验证 → 冻结旧引擎 → 本地提交。旧世界不迁移。

## F2 已读出的原作细节（2026-10-22）
- 每月1日 AssignRandomUpdateDays：存活国家的家族 updateDay = Random.Range(1,29)，进入当月更新表；每日到日的家族依次 UpdateFamilyDuration → (人口/婚姻: F3) → 影响力 → 旁支维护。
- UpdateFamilyDuration：所在国居住月数 +1；执政家族另计执政月数、历史国家、最近执政时间，并给所控行省历史宣称 +0.5。
- 影响力：旁支×2 + (行省×20 + 10 + 成员×5)，执政 +100，ln(max(1,财富))×10，存活族长特性 familyInfluenceModifier，限 0—1000。
- MaintainCollateralBranches：移除不存在/死亡的旁支；不足 1 人时 CreateCollateralMember（性别 value≤0.5 为女、年龄 20—40、四项基础 20—80）；超过 4 人移除最新者。开局旁支实际写入 memberIds，故首次更新会补 1 名旁支。
- 每年1月1日 UpdateFamilyHistoricalClaims：持有行省宣称 +1，未持有 −1（≤0 删除），新持有行省记 1。
- MonthlyUpdate：CheckProvinceControlConflicts 只写错误日志；6/12 月 CheckFamilyRebellions，12 月 CheckCivilWarConditions（F5/F6）。
- 领地再分配：State.monthsUntilTerritoryRedistribution 初值 −1，首次 Random.Range(1,25)，之后每 24 个月；目标数按（实力×0.05 + 战功）占比，上限按政体比例（家族数×比例 < 0.9 时提高到 0.9/家族数）；选种子省（已持有 +200、家乡 +150、距期望中心、人口/10000）→ 按层广度扩张 → 就近补足 → 剩余省份给仍未满额的最高评估家族；未进入计划的行省失去家族；家乡改为计划中离质心最近的省；记载“{国}进行领土重新分配，{X}战功最高，{Y}战功最低”。

## F3 已读出的原作细节（2026-10-22）
- ProcessBirths：家族在世主成员 <15；已婚女性 18—40 岁、丈夫在世、双方子女均 <3；月几率 = CalculateBirthChance/12：子女0/1/2/≥3 → .45/.3/.1/.2，年龄18—25 +.1、26—35 +.05、36—40 −.1，家族在世 <3 +.1、3—4 +.05、>10 −.15，有未满2岁子女 ×0.3。
- CreateChild：性别按母亲在世子女男女数补齐（相等时 value≤0.5 为女），随父系（从妻居随母系）家族与姓，魅力=(父+母)/2×(1+Range(−.2,.2)) 限0—100，其余三项 20—80，先天特性各 20% 遗传；统治家族、族长/继承人之子女、影响力>500 的首胎、影响力>200 的长子出生记入大事。
- 婚姻：未婚成年（18—45）对全体在世异性（非近亲；族长不娶别家族长）打分取前10中最高：同国 .8×50/异国 .2×50 + 对方家族影响力/10，异国人物 +20，相容度 =(1−|魅力差|/100)×.3+.5+同文化.4/异文化.1+同宗教.3，限0—1 ×50。
- 从妻居：女方为族长/继承人，或家族允许女性继承且族长无在世儿子；男方须非族长、继承人、族长长子。迁入方脱离原家族、改姓（网页：仅当姓氏属于其文化）。
- 继承：HandleMonarchySuccession 先在统治家族找继承人/回退人选，再按 CalculateFamilyEmergencyScore（影响力×.8+战功×.5+在世×10+旁支×2）选替代家族，最后 HandleDynastyChange（实力+战功最高家族的在世族长或最年长成员）。任命新领袖即其家族成为统治家族。
- CheckFamilyExtinction：主成员无在世者即灭绝（旁支不计），记“{0}家族灭绝，最后成员{1}去世”，领地失去家族控制。
- 网页适配（如实记录）：迁入方随新家族改属国家；同一轮已成婚者、族长、在任领袖不作迁入方（取下一候选）；年中出生的新生儿按 0 岁验证。

## F4 已读出的原作细节（2026-10-22）
- CalculateFamilyRelation(a→b)：同国不同家族才有值；= 存储关系 + 婚姻纽带 +（文化不同 −20）+（宗教同 +10/异 −15）+ 地理 + 实力差 +（b 族长在世：(魅力−50)×0.5，再加 SocialButterfly 的 relationshipBonus），限 ±100。
- 婚姻纽带 CheckMarriageConnection：一方在世成员的在世配偶出身于另一方家族 → 10（任一方从妻居则 5），两向取最大。
- 地理 CalculateGeographicalModifier：两家族都有领地时，取各自前3个领地两两 CalculateProvinceDistance（中心距离/5，限1—20，缺省1000）的平均：<10 → +5，>30 → −10，否则 0。
- 实力差 CalculatePowerGapModifier：实力+战功之比（大/小，小者至少1）：>10 −25，>5 −15，>3 −10，>2 −5，其余 −3。
- 存储关系只在号召叛乱（F5）与流放（家族命运）时改变。
- 军队家族 DetermineArmyFamilyAndType：指定家族 → 家族军；否则中央军 =（强制或核心行省），所在行省有控制家族 → 归该家族（无则家族0、中央军）。
- 战功 RecordBattleMerit / RecordConquestMerit 按政体分配：王国/帝国中央军且领袖有家族 → 领袖家族；家族军 → 军队家族；联邦/共和家族军与领袖家族各半；部落/神权家族军 → 军队家族，否则领袖家族。歼敌累计 totalEnemyDestroyed，攻占每省 totalProvincesConquered +1；国家家族战功贡献 +歼敌×0.1、+攻占×5（分半时各半）。
- 攻占行省 Province.ConqueredBy：原控制家族失去该省，若因此无地 → 家族命运（DecideFamilyFate：宣誓效忠/部分复原/剥夺/流放/清洗）；新省经 WarSpoilsAllocation 分给参战家族。
- 攻占不立刻分给家族：AllocateConqueredProvince 只把该省控制家族清零（TryImmediateAllocation 等无调用者），新领土待下次领地再分配。
- 家族命运 DecideFamilyFate（失去最后一块领地时，攻占方国家为 conqueror）：统治家族且原国仍存且非攻占方 → 流放；否则按权重 Range(0,总和) 依次落在 宣誓效忠/部分复原/剥夺/流放，余为清洗。执行后 totalEnemyDestroyed ×1/3。
- 权重 CalculateFateWeights：基准 效忠30/复原20/剥夺40/清洗17.2/流放25；攻占国家族≤3：+40/+80/−20/−8/−15；攻占国领袖与本族族长文化不同：剥夺+20、清洗+10，相同：效忠+40、复原+20、清洗−20；领袖特性含仁慈类：复原+50、效忠+30、清洗−30、剥夺−15；含残暴类：清洗+350、剥夺+5、复原−40、效忠−30；本族对领袖家族存储关系 >50：效忠+30、复原+20，<−50：清洗+30、剥夺+10；影响力>500：效忠+15、复原+10、清洗+20，<200：剥夺+20；战争类型：征服 效忠+10 复原+10 清洗+1，叛乱/家族叛乱 清洗+49 剥夺+20，内战/继承内战 清洗+66 效忠−25，改革内战 清洗+59 效忠−20，独立内战 清洗+42 剥夺+15，推翻内战 清洗+52 效忠−15；非统治家族另加：文化不同 流放+20、影响力>500 流放+15、叛乱或内战 流放+25；统治家族：原国存续且非攻占方 → 只流放100，否则 效忠50/剥夺30/清洗20；历史宣称合计>20 → 复原 + 合计×0.5；各项不小于0。
- 宣誓效忠：转属攻占国，影响力×0.7（原统治家族）或×0.5，成员与旁支改属该国。
- 部分复原：在攻占国内宣称≥5且可夺回（CanReclaimProvince）的省份，按影响力>500取80%否则50%（原家乡在内再+20%），至少2块，夺回（GrantProvinceToFamily：原持有家族得补偿 影响力+50/统治+100、财富+100/统治+200）；转属攻占国，影响力×0.5；无可夺回则改为剥夺。
- 剥夺：失去全部领地，影响力×0.2、财富×0.5；原国存续则留原国，否则转属攻占国。
- 清洗：全体在世成员与旁支死亡，家族移除。
- 流放：失去领地，去往其他存续国家（随机），影响力×0.3（另有×0.4×0.4 分支）、财富×0.5/0.6，与攻占方领袖家族关系 −15、与接纳国 +15，成员改属。

## F5 已读出的原作细节（2026-10-22）
- CheckFamilyRebellions（每年6、12月，World.allowFamilyRebellion）：逐家族 ShouldFamilyRebel → StartFamilyRebellion。
- ShouldFamilyRebel：非统治、有领地、影响力≥200、国家存活且非空白可征服；距本国上次家族叛乱 ≥ WorldSettings.minMonthSinceLastFamilyRebellion（默认18，天命保护期×4）；对统治家族关系 ≤−50；几率 = |关系|/100×0.1 + (100−国运)/100×0.1 + 0.05，联邦/共和×0.5、部落×1.5，×(1−领袖叛乱抵抗)；value < 几率即叛乱。（内战默认间隔36月。）
- TryFamilyRestoration：家族曾统治且已灭亡、复国次数<15 的国家，按 CalculateRestorationWeight（0—95）以 Range(0,100) 判定复国：统治月数 rd<12 →0；分段 rd<36 rd×0.5，<120 (rd−36)×0.3+18，<360 (rd−120)×0.2+43，否则 (rd−360)×0.1+91，上限150；+20 + 影响力/1000×20 + min(领地×3,30)；×时间衰减（距最近执政月数 <12:1，<60:1−(m−12)×0.005，<180:0.76−(m−60)×0.003，<360:0.4−(m−180)×0.001，否则0.22）×政体（王国1.3、帝国1.5、共和0.7、其他1）×同文化1.2×max(0.1,1−复国次数×0.1)，rd≥1200 再×1.5。
- 否则 CreateRebelState：文化=家族文化，国名取该文化未用国名，State.InitTrait，建立时间=现在，随机底色；首都=家乡（不在领地则第一块领地）。
- RallyFamiliesForRebellion：本国除叛乱家族与统治家族外的家族逐一以 CalculateRallyResponseProbability 判定：基础0.2（复国时按在该国居住月数 >240:1、>120:0.9、>60:0.8、否则0.7，曾统治再+0.3）；本国居住 <12 +0.3、<60 +0.1、≥240 −0.2；+ 叛乱家族对其关系/200；同文化+0.15；同宗教+0.1；+(叛乱影响力−其影响力)/1000×0.1；其对统治家族关系 <−50 +0.2、>50 −0.2；号召冷却中→0；限0—1。响应：冷却24、双方关系+20；拒绝：双方−5。
- 叛乱家族与响应家族改属新国（成员改属），叛乱家族为统治家族；其全部领地被新国攻占（Province.ConqueredBy）。
- 领袖：族长在世即任；否则在世成员中 16—60 岁，男性优先，魅力+军事+行政高者优先，再取年龄最接近35者；都没有则 CreateRebelLeaderForFamily。AppointLeader('rebellion')，State.Start。
- TransferFamilyArmiesToRebelState：原国中属于该家族的军队，及驻地家乡在该家族领地的军队（中央军改归该家族）转入新国并脱离战斗；一个都没有则在家族领地新建军队。
- 战争：原国对新国 WarType 4（家族叛乱）、CB 15、目标7，原国为发起方。
- 家族叛乱战争结束：叛军存续 →“{0}家族成功建国{1}，推翻{2}，控制{3}个省份，历时{4}个月”；失去全部领土 →“{0}家族的叛乱（{1}）被{2}成功镇压”。

## F6 已读出的原作细节（2026-10-22）
- CheckCivilWarConditions（每年12月，World.allowCivilWar）：存活、非空白、行省≥15 的国家逐一 CheckStateForCivilWar。
- CheckStateForCivilWar：有统治家族；距上次内战 ≥ WorldSettings 内战最小间隔（默认36，天命保护×4）；不满家族 = 有领地的非统治家族中对统治家族关系 <−40 且影响力 >100；不满家族 ≥2 且国运 <60 时以 (60−国运)×0.01+0.1 的几率 StartCivilWar。
- 内战类型→开战理由/目标：继承(8)→CB10/目标10；改革(9)→CB11/目标9；独立(10)→CB12/目标7；推翻(11)→CB13/目标8。
- DetermineCivilWarType：影响力最高的叛乱家族与统治家族同姓 → 继承；叛乱家族全部领地距首都 ≥10 且平均 >15 → 独立；叛乱家族 ≥2 且国运 <60 时，任一叛乱家族文化与国家文化不同 → 改革，否则推翻；默认推翻。
- StartCivilWar 结构同家族叛乱：已在内战则取消；领导家族=影响力最高者；可尝试复国；号召其他家族；新建叛军国（内战命名）；全部叛乱家族领地归叛军；领袖同叛乱规则；AppointLeader('civil_war')；转移军队；按类型开战（CB10—13，目标10/9/7/8）。
- 和约效果：独立 IndependenceEffectV2（叛军国已独立存在）；继承/改革/推翻三种 V2 效果均为 CivilWarSettlementUtil.InheritIdentity：胜方（须存活）继承败方国名、译名与自定命名；推翻另给胜方统治家族影响力 +100。失败文本“夺位/改革/推翻胜方或旧政府不存在”。
- 目标 8/9/10 只在目标国（原国）灭亡或无地时达成；独立目标 7 按原独立规则。原国胜利时 PeaceResolverV2 对 WarType 8—11 掷平定内战国运（已有）。
- 内战原因 DetermineCivilWarCause（领导家族=影响力最高）：继承——统治者无子女“无嗣”，领导家族与统治家族同姓“旁支”，否则“正统”；改革——国运<40“腐败”，叛乱家族≥3“联盟”，否则“政治”；独立——文化不同“文化”，宗教不同“宗教”，否则“边远”；推翻——对统治家族关系<−70“仇恨”，影响力>统治家族×1.5“权力”，否则“压迫”。
- State.timeStampLastCivilWar（母国）在 StartCivilWar 开始与结束时都写为当前时间；距离为首都省中心与行省中心的 Vector2.Distance（原作单位）。
- 国家面板“触发内战”（StateInfoUI.OnTriggerCivilWarButtonClicked → DebugTriggerCivilWar）：有统治家族、至少2个有领地的非统治家族，取影响力最高的2个直接 StartCivilWar。
- 内战结束 CivilWarEndEvent：叛军胜“{原国}的叛军取得了内战胜利”+按类型“{叛军}成功夺取了{原国}的王位/推翻了腐败政权/独立/推翻了{原国}的统治”；政府胜“{原国}成功平定了内战”+按类型镇压文本；附战争天数（网页附军力损失，原作战分单位）。
- 网页适配（如实记录）：复国与内战命名模式未移植，一律建立新国；胜方文化与败方不同时，败方国名作为胜方自定国名；有在任领袖宫廷记录的家族不参加。
- 文本：内战开始“{0}爆发内战，{1}领导{2}个叛乱家族对抗{3}个忠诚家族”（继承型“{0}爆发继承权内战”）；结束“{0}内战结束，{1}掌权，清洗了{2}个家族，造成{3}人伤亡”。
