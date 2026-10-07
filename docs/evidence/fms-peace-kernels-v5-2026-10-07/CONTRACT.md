# 原作议和、条款构建与各国结局内核

2026-10-07，父 HEAD 604b3b4。根为唯一写入者，两名代理只读核查。接续 WEB-04-37；不是新试玩版本。授权安装包 GameAssembly.dll 的 SHA-256 为 `d42658a922155f6cc60295a64c02207e5eaa1d3a55fd5ed18dc8ecc562f9b82b`。没有运行原作或读取认证、SDK 配置、个人存档；不提交 dump。

## 实际实现和证据边界

新增 `src/fms/play/native-war/peace.ts`、`settlement-verdict.ts`、`settlement-plan.ts`、`settlement-classification.ts`，共四个实现文件。沿用已验证的 score/weariness，不更改它们。本批仍没有生产 import、实际转地执行、v28、Worker 新版本或新存档库。当前可玩仍为 v27 / Store29。

实现覆盖三个相连切片：自动结束理由及期限筛选；胜方判定及条款构建；计划/实际效果条件下的各国结局及最终胜方重判。输入为合法原生 int32/float32 值及有效枚举，保留 f32 运算和已核查询次序。非法 NaN、CLR 异常类型/栈、真实 Unity 世界联调不在合同内。空 scope 按原路径抛异常，不宣称 JavaScript TypeError 与原异常类型相同。

`hasStateCollapsed`、`goalAchieved`、`internalGoalsAchieved`、`buildInternalPlan`、`buildEffect` 是显式依赖，未用猜测规则填充。日历端口返回完整历月，不用网页 day/30。没有把当前 v27 实际扣人数直接当原生 kills/deaths。

基础入口及哈希沿用 [原自动议和审计](../fms-war27-v5-2026-10-07/NATIVE_PEACE_FOLLOWUP.md) 和 [原分数/厌战及结算主链](../fms-war26-ui-v5-2026-10-07/NATIVE_WAR_KERNELS.md)。本批补充分类、终战清理及上游伤亡快照，见 [NEXT_INTEGRATION](NEXT_INTEGRATION.md)。方法跨度含尾部对齐字节；静态核查不是运行原作的数值联调。

## 恢复合同

### 自动议和

- 内战：先主攻后主守 `IsDeadOrZero`，任一真返回 Collapse=2；Rebel=2/RebelRegular=3 否则继续；FamilyRebellion=4 的内部目标最低月数24，其他36。实际目标达成仍交端口。
- blank-conquerable：先主守后主攻，仅 `IsDeadOrZero`，不查月份和战争分。
- 普通战争：完整月数>=12且至少一项可执行目标、全部达成→GoalsAchieved=0；然后主守、主攻 `HasStateCollapsed`→Collapse=2。这与死亡/零列表不是同一函数。
- 重新查完整月数，<36继续；强制结算或分数<=-50/>=50→WarScoreSettled=1；两主国厌战先分别计算，任一>=.5→FatigueTimeout=4；否则继续。
- 参与国自动外交资格只看当前参与者中的存活国家。经理最大时长入口独立于36月门：外部已提供活动战争列表，世界自动外交开启且期限>0时，筛选非内战、完整月数>=期限；先快照 ID。允许 blank，不直接执行 EndWar。

### 胜方、吞并与条款

- 判主守崩溃再主攻；缺失/死亡/空省列表或崩溃端口真均算。双方崩溃→无胜方，单方崩溃→另一方。再处理理由0/9攻胜、双方 distress 差、分数±50。
- FatigueTimeout 的总分未决时，重新计算 TerritorialComponent*100 和 GoalComponent，二者均在分支判断前查询，不复用第一次分数分量。正领土>=10且目标>0攻胜；领土<=-10，或<=0且攻方 distress 比守方高>=f(.1)则守胜。
- 决定性吞并只可能攻胜：双方对象存在、守方存活且当前陆省>=1。有任意 Annex 目标时，以初始守方归属且当前仍为陆地的省数为基数；攻侧持有旧守都采用 .7，否则 .4。**比例失败或初始基数缺失后，仍检查守方仅一陆省且攻实力>=守方三倍的兜底。** FatigueTimeout 仅禁止新触发吞并，不清已有 conquerorId>=0 标志。
- Build 对 null 或理由6/7/8/10/11返回 null；理由4/5正常。内战走独立端口。原作 SideIds 来自当前+已销毁参战列表，HashSet去重。
- 已达成可执行目标无需受益国属于胜方；未达成只有0/1/4/6/11可凭受益国属于当前胜方强制加入。5 Liberate不执行。
- 非领土效果4/6/11必须非吞并且 buildEffect非空，才先记录目标ID、再记录效果。空效果/被吞并抑制不记目标ID。
- 转地先解析目标省列表，首次省ID条款优先，查存在/陆地/非受益国，再排除 OccupyCount=2，再查固定守方集合。不添加目标国，不回退主守，包含已销毁守方。
- 非吞并查该当前省主的陆省数>1，但不扣已排队转让。因此不能声称“结算保证保留最后一省”。这里不要求受益国已经占领该省。
- Annex 从目标国当前陆省列表选取；其他类型直接 scope IDs，null scope异常、null IDs空表。OccupyCount也经过该解析。决定性吞并最后补主守→主攻，保留先有条款，不逐项重验败国列表内 owner。
- Build 只生成计划，不改变省归属；之后按 pending=true / actual=false 计算结局。

### 每国结局与最终胜方

原枚举 Victory=0、Defeat=1、Peace=2。缺失、死亡、省列表为空或崩溃→Defeat。否则真实/待执行净获省>=1→Victory；吞并受益者→Victory；计划或实际成功效果受益者→Victory；守方未被效果施加、所有可执行目标均失败、本人初始省无损失→Victory；其余Peace。仅丢地不自动Defeat，胜方盟国也不自动Victory。

NetGain先按初始省快照和当前陆地/owner统计敌我转变，再可选累加待执行条款，后者不去重，也不排除“已经占有”的再次加项。LossFraction不筛陆地或敌我，只看本人初始owner变了多少，再除初始列表Count。AllEnforceableGoalsFailed检查所有可执行目标，名称虽带Attacker，实际不筛 addedBy。无可执行目标不是全部失败。

结局遍历当前列表后接已销毁列表，不去重，同ID后写覆盖。已有判定胜方时，败方的无实际收益Victory降为Peace，Defeat不变；有获省/受益/效果保留Victory。计划阶段可保留判定胜方，实际效果失败后必须重判最终 winnerSide；双方有获胜国可无唯一胜方。victorSide 与 winnerSide 分开。实际效果只承认 Applied=0/AlreadySatisfied=1，Failed=2不承认；appliedTransfers列表本身不构成额外吞并受益。

## 检查、修正与未完成

- 新增24项 peace/verdict +33项 plan/classification，共57项；加既有35项 score/weariness，最终92项/4文件全部通过。第一次92项亦通过；只读二审随后发现两项测试证据缺口，修正后重跑仍92通过。
- 全仓 lint/typecheck通过；最终小改后再跑 native-war lint。结果和源码摘要见 checks.json；unit-final.json为真实报告。没有运行全仓历史测试、构建或浏览器，因为无生产接线/产物改变；没有新增性能或视觉结论。
- 编写阶段二审修复三项合法输入偏差：固定守方集合、Annex兜底、普通HasStateCollapsed。另恢复blank顺序、重复日历/分量查询、双厌战计算、OccupyCount解析等次序。
- 测试复核修复：目标优先测试改为让hasStateCollapsed抛错；原“50分”用例实际65，改为明确先断言恰好50再验证36月边界。记录缺口而不将旧用例称为边界证明。
- 实际 ExecutePlan、ConqueredBy、三种 effects.Apply、内部结算、战争开始/结束生命周期、原始伤亡来源映射和生产版本桥接仍未接入。WEB-04-37保持in_progress，完整PH、真机和视觉门不变。
