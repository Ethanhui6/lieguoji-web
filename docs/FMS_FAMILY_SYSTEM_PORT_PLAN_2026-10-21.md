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
| F1 | 新世界家族规则开关与数据模型；开局执政家族领地、贵族家族与领地、剩余行省就近分配、初始分布校正 | 待做 |
| F2 | 月/日/年调度：更新日、存续时长、影响力、旁支维护、领地控制冲突、历史宣称、领地再分配 | 待做 |
| F3 | 原作生育与婚姻、继承人与族长继承（替代网页婚育） | 待做 |
| F4 | 家族关系（婚姻纽带、地理、实力差）与战功 | 待做 |
| F5 | 家族叛乱：判定、原因、复辟、号召、发动、结束文本 | 待做 |
| F6 | 内战：条件、类型、原因、发动、首都陷落内战、和约继承 | 待做 |
| F7 | 界面：家族面板、家族视图领地着色、AI全局配置 允许内战/允许家族叛乱与间隔 | 待做 |

每批：原作反汇编 → 网页移植 → 单元与浏览器验证 → 冻结旧引擎 → 本地提交。旧世界不迁移。
