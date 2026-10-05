# 原作占领链：只读静态核验

2026-10-06；用户要求修正“速度太快、抵达后整区立即吞并”。只读授权安装目录与本项目已有元数据索引，未执行原作、恢复脚本、DummyDLL，未读认证/SDK配置或个人存档。原文件不写入；raw/dump 不提交、不进入 dist。

对象：Windows x64 PE / Unity 2021.3.36f1 / IL2CPP metadata v29；不是 ELF/DWARF。GameAssembly.dll SHA256：`d42658a922155f6cc60295a64c02207e5eaa1d3a55fd5ed18dc8ecc562f9b82b`。按现有索引定位小函数，再对原 DLL 指定 RVA 的机器码静态交叉核验。不是实机观察。

## 已核验链条

|入口|RVA|实际行为|
|---|---|---|
|Army.SetCurrentCell|0x3505C0|写 currentCell；跨省通知 UnitPresenceIndex.MarkArmyDirty，不转移土地|
|Army.BattleInProvince|0x344100|累加独立 battleTimer；间隔到时先对军伤害，再消耗省分数|
|扣分与阈值|0x34467C–0x34468E / 0x3446A9|battleScore 减小；<=0 才调用征服|
|Province.ConqueredBy|0x4511D0；调用0x344A44|转移单个省，通知新旧国家，重置该省防御分数|
|State.OnProvinceAdded|0x5D2DD0|只遍历该 Province.cells 更新归属，不全国转移|
|State.OnProvinceRemoved|0x5D30E0|剩余 provinces.Count==0 才 DestroyState，判断0x5D31FE|

原作普通占领也在成功时一次转移一个省的格子；并非士兵走过一个格子就涂色。网页不能用假的逐片变色动画宣称原作 cell 级控制已恢复。

## 省防御容量与攻守作用

`ProvinceManager.GetAverageProvinceBattleScore(0x46D830)`：N为有效省数量，C为总cell数量，F为simulateFactor，返回 `200*N/C*F`。F静态默认2（WorldSettings..cctor 0x6E2282），各省 `maxBattleScore=max(1,cells.Count*averageBattleScorePerCell)`。启动0x471019重算；构造初始100不是正常开局重算后的满值。

`RecalculateProvinceBattleScore(0x45AFB0)`：锁定且旧max有效则保留；旧值满则新max仍满；已损坏则保留绝对剩余分数并夹在[0,newMax]。

`Army.CalBaseCombatEfficiency(0x345B60)`：省伤害基础 `10*State.SiegeDamageBoost`；对军基础 `40*State.FieldCombatEfficiency`；基础效率 `1.25*State.BaseBattleEfficiencyBounus`。每军独立脉冲扣 `damageToProvince*combatEfficiency`；该省所属国自己的军队取负，反向回补。港口受封锁的进攻可乘2。父函数在无守军时仍扣省分数；有守军也不构成绝对“不得占领”门。

`RecalCombatEfficiency(0x34E5B0,1040字节)`未读取armyCount，包含国运、领导、兵种、政体、地形/核心防御、精锐等。完整各倍率和第三国征服 recipient 条件尚未迁移，不能把网页按兵员换算的效率称为原作公式。

`Province.GetCombatEfficiencyModifier(0x453D30)`：手工堡垒可返回3；其他combatEfficiencyModifier限制[1,10]；守方乘、攻方除。没有首都或城市独立额外耐久层的证据。已读Province.Update/UpdateProvinceData/Army.Idle未见“撤军就自动恢复”；已确认的恢复来自本国军队脉冲。

## 两种时间与首都失守

Army.UpdateState 0x3523E0 读取Unity.Time.time的差：首次2缩放秒，其后2*Random.Range(1,3)，即2–6缩放秒；不等于2–6日历日。

WarSystemV2 首都事件：NotifyCapitalConquered 0x665670只登记；ProcessMonthly 0x665FE0在战争/国家有效、敌仍持有首都且GetMonthSince>=1（0x66630F）时Resolve。收复则取消。Resolve 0x666590结合崩溃压力与随机数，可能走吞并/内战，非必然全国吞并；原国还可RecalculateCapital。完整V2崩溃与外交结果留待后续。

## 本轮网页适配合同

- 用真实辖区多边形面积代替原作cell数，容量 `max(1,400*本省面积/平均省面积)`，无额外首都耐久。
- 半网页日权威脉冲；原作Unity时钟、随机间隔未等价迁移。
- 用现有网页兵员、士气、粮草、兵种和地形/城防效率；攻扣守回；多国入侵以最强当前侵攻国为主、稳定ID解平局，未声称原作recipient完整恢复。
- 完成仅转移本省实控，法理与其余国家省份保留。离开不凭空修复；本国驻军回补。停战取消敌对围攻。
- 连续路线和普通跨敌区军令均等待本省完成；撤退可以终止驻守。围攻阻止当地征军、迁入首都、港口补给/造船。
- 不实现省内cell游走、逐格战线、首都按月崩溃、最终灭国/条约或海军封锁。没有改变全局时间倍率来冒充占领规则修复。

功能、测试、浏览器和存档的最终证据见同目录 DELIVERY.md；原作主观等价、iPhone 真机与用户视觉仍未验收。
