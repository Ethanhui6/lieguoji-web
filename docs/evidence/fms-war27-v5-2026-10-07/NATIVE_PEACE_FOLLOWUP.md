# 原作自动议和续接：静态证据，尚未接入

2026-10-07。只读代理沿本批指定入口核查；根未运行原作。授权 DLL SHA-256 仍为 `d42658a922155f6cc60295a64c02207e5eaa1d3a55fd5ed18dc8ecc562f9b82b`。以下不是 v27 游戏行为或数值联调证据。

| 入口 | RVA / 字节数 | 方法 SHA-256（含索引跨度内对齐字节） |
|---|---|---|
| CheckMaximumDurationWars | 0x683E30 / 944 | fa56a3130ff27956ceb3e6b18ea1e1881bca281e197f9449fd8b7bf6acf2cd7b |
| EndWar | 0x6848F0 / 2256 | 762433f7ff8440cd3c3875c771328047bfaa4778d896c41168e1703e3b505d66 |
| 期限筛选 lambda | 0x6889E0 / 208 | c7e0559e30bfb142c0b9727711388f78fd9383994c10fa0b89d41935e9e3c440 |
| GetWarMonth | 0x692120 / 112 | 1ca6f16e13282638f9936b2ba33f0152b68ef852bee8ec93145ba5616eebbb93 |
| EvaluatePeace | 0x6757F0 / 2192 | 1cd9c4dec140f01d98d2e37f1d57773629c789330cf919c2d8c788185db54283 |
| DecidePeaceReason | 0x674B40 / 880 | 9455001f4952a9b2a9a521a9326971d66ecdab289433d5343bb3c922c063acf2 |
| HasAutonomousDiplomacyParticipant | 0x676080 / 320 | da7f486e028783e4735f8712fe49c688d16da62f0ecfe442f40478fb275215f3 |
| AllEnforceableGoalsAchieved | 0x674310 / 368 | 1eaebd3f2e90af95a98cae98fd128151fedb51d7b302d3d363ac38f53c0dcdd6 |
| TimeManager.GetMonthSince | 0x5235E0 / 160 | 8fee95c5dcdcb604af5b4faf009fba7d179d8df5eb5a4311174a10024b3cc811 |

`CheckMaximumDurationWars` 先要求 World 存在、世界自动外交开启、`maxMonthBeforeForceEndWar>0`；快照收集活动战争中非空、非内战、完整历月 `>=` 配置阈值的 ID，然后逐一 `EndWar(FatigueTimeout=4)`。没有额外 36 月限制，不查战争分或国家级自动外交开关，不排除空白可征服战争。元数据默认常量 240、上限 480 不代表用户当前设置。本函数不是超时自动白和。

`EndWar` 先查战争对象，再从 activeWarIds 删除；删除失败则结束。然后取消首都危机。理由 `{6,7,8,10,11}` 跳过和约，其他理由在 PushSettlementWar 的作用域内 BuildSettlementPlan → ExecutePlan，finally Dispose；随后 ApplyWarEnded。ManualCeasefire=11 属于跳过和约的组，FatigueTimeout=4 与 NominalPeace=5 均进入和约。本函数不删除 wars 字典，也未提供和约异常后的活动 ID 回滚。

普通 `EvaluatePeace` 还要求至少一个当前参战国家存在、存活且国家自动外交开启。`DecidePeaceReason` 顺序：

1. 内战先检查主攻/主守死亡或零地区。Rebel、RebelRegular 未崩溃则返回空；FamilyRebellion 交内部目标检查的最低月数24，其他36。
2. 空白可征服战争只在任一主国死亡/零地区时返回 Collapse。
3. 普通战争满12月且至少一项可执行目标、全部可执行目标完成，返回 GoalsAchieved。
4. 先主守后主攻检查崩溃，返回 Collapse。
5. 未满36月返回空。
6. ShouldForceSettle，或战争分 `<=-50` / `>=50`，返回 WarScoreSettled。
7. 任一主国厌战 `>=0.5f`，返回 FatigueTimeout；否则空。

这里没有产生 NominalPeace=5 的分支，不扩大为整个原作不存在白和。AllEnforceableGoalsAchieved 的空集合返回 false。GetMonthSince 使用 GetDate 转换与 NodaTime 的完整月差，不用 day/30 冒充原历月。

下一恢复边界：两类自动入口的上游同月调度顺序；ApplyWarEnded（0x682930）；首都事件取消/战争上下文释放的内部效果；和约 ClassifyOutcomes 及完整条款效果。已有 score/weariness 内核不重复恢复。v27 当前战损单位是网页显示兵员，保守归因且历史有未知，不直接给原作击杀计数接口代值。

定位索引仅保留于本地 `.autopilot/fms-audit/binary/dump/dump.cs` 与 `script.json`，不提交原 dump。
