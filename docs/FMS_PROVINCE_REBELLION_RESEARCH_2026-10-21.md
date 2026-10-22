# 第12步研究记录：原作行省叛乱（2026-10-21）

来源：GameAssembly.dll 只读反汇编（State / Province / WorldSettings / DiplomacyManager），原始反汇编不入库。

## 触发入口
1. **逐省月检**（主要途径）`Province.AdvanceOneMonth`：行省有国家、国家非空白时先 `UpdateProvinceData`；当 `当前月 % (int)WorldSettings.simulateFactor == 0`（默认2，即每两个月）调用 `TryRebel(isForceRebel=false)`。
2. **超级大国叛乱** `State.AdvanceOneMonth` / `UpdateSuperRebel`：距上次内战 ≥24 个月、国运 ≤30、`IsSuperSuperPower`、世界“允许叛乱”、`CanAllowNewRebellion` 时调用 `ProcessRebellion`：
   - 候选：国运 >13 时仅非核心且不在战争中的行省；否则不在战争中且非首都的行省。
   - 概率 p = clamp((30−国运)/20, 0, 1)×0.3+0.35，再 ÷simulateFactor；有在世领袖时 ×(1−领袖叛乱抵抗)；×政府官职地方叛乱倍率；距上次家族叛乱不足 minMonthSinceLastFamilyRebellion(18) 个月时 ×0.1。
   - Random.value ≤ p 时选一省 `TryRebel(true)` 并 `RecordNewRebellion`。
3. 手动：行省面板“煽动叛乱”、国家面板随机叛乱、命令 ForceRebellion。

## WorldSettings 默认值（.cctor）
simulateFactor 2；minMonthSinceLastRebel 12；minMonthSinceLastFamilyRebellion 18；minMonthToRebelSinceConquered 8；minProvinceCanRebel 30；minMonthProvinceCanRebelSinceStateBorn 15。“行省叛乱最小间隔”滑条对应 minMonthSinceLastRebel（待确认 EditPanelUI 映射）。

## 近期叛乱队列
- `GetMaxRecentRebellions`：maniFestDestinyCount==0 时 10000（不限）；否则 max(1, 基数−次数)，基数按国运 <13:12、<20:7、<25:5、其余 4。
- `CanAllowNewRebellion`：先移除早于 26 个月的记录，队列长度 < 上限。`RecordNewRebellion` 同样清理后加入当前时间并截断到上限。

## CanProvinceRebel(state, province)
距上次内战 ≥24 月；CanAllowNewRebellion；国运 ≤ (行省连通? destniyToRebelConnected : destinyToRebel) − maniFestDestinyCount + 5；国家行省数 ≥30；距上次叛乱 ≥12 月（国运<15 且超级大国时 ÷6）；建国 ≥15 月。

## TryRebel(isForceRebel)
非强制时的门槛：世界允许叛乱；本省不是首都；核心距离超过国家核心阈值或 maniFestDestinyCount ≤1；CanProvinceRebel；距被征服 ≥8 月；不在战争中（CheckWarStatus）。
概率：chance = min(80, (核心距离+2)×5)；距上次家族叛乱 <18 月时 ×0.1；×官职地方叛乱倍率；取整后限制在 0—100；`Random.Range(0,100) < chance`。
随后（强制与非强制相同）：
1. 记录 RebellionEvent（“{0}发生叛乱”）。
2. 选取一并起事的行省集合（按权重筛选的相邻行省）。
3. 叛军身份：若有可复国的同文化旧国则复国（ReestablishedEvent），否则 `StateManager.CreateRebelState`，国名按文化取未用国号（GetRandomCountryKeyExceptNames / CultureData.GetStateName）及命名继承模式。网页已有 native-culture/rebel-identity.ts、rebel-name.ts 可复用。
4. 摧毁省内原国家军队；原国家首都失守则 RecalculateCapital；新国颜色取基础色；转移行省（OnProvinceRemoved/OnProvinceAdded、区域与家族封地移除）。
5. 新国领袖与家族（须为成年人），`State.Start`。
6. 宣战：战争系统V2 用 `CasusBelliServiceV2.BuildInternalWarDeclaration` + `WarManagerV2.StartWar`（内部战争，CB16 之类已在附庸独立中接入）。
7. `SpawnProvinceRebellionInitialArmies`，叛乱持续期间每 3 个月补军（c_ProvinceRebellionReinforcementIntervalMonths），叛乱战争最长 36 个月（c_RebelWarMaxMonths）。
8. 史书：FoundedEvent 或 ReestablishedEvent；原国家 RecordNewRebellion。
结算文本：RebellionSucceeded“{0}推翻了{1}的统治，控制了{2}个省份，历时{3}个月”等。

## 网页实现拆分（建议批次）
- 12a：运行中新建国家的基础设施（国家、文明身份、领袖家族、财政/经济/战斗/外交/联盟/附庸各表的新行），复用复国路径；单元验证全部校验器通过、可回放。
- 12b：TryRebel 门槛与概率、逐省两月检查、超级大国 ProcessRebellion、“允许叛乱”开关与“行省叛乱最小间隔”滑条。
- 12c：内部宣战、初始叛军与每3个月补军、36个月上限与结算文本；行省面板“煽动叛乱”（强制）。
