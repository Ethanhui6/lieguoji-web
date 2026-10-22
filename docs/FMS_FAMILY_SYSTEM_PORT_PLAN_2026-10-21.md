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
| F4 | 家族关系（婚姻纽带、地理、实力差）与战功 | 待做 |
| F5 | 家族叛乱：判定、原因、复辟、号召、发动、结束文本 | 待做 |
| F6 | 内战：条件、类型、原因、发动、首都陷落内战、和约继承 | 待做 |
| F7 | 界面：家族面板、家族视图领地着色、AI全局配置 允许内战/允许家族叛乱与间隔 | 待做 |

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
