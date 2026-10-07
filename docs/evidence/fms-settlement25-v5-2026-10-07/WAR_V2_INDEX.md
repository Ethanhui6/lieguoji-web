# 下一批原作战争 V2 精确入口

2026-10-07 只读复核指定安装包。GameAssembly.dll SHA256 d42658a922155f6cc60295a64c02207e5eaa1d3a55fd5ed18dc8ecc562f9b82b。这里是函数定位和静态机器码观察，不是生产实现，也不是已玩过桌面版本。

索引为本地忽略目录 .autopilot/fms-audit/binary/dump/dump.cs，不提交raw dump。

| 功能 | 原作函数 / RVA |
| --- | --- |
| 连片诉求 | WarProvinceQueryV2.BuildConnectedClaimProvinces / 0x6891D0；GetCedeableProvinces / 0x689FB0 |
| 连片生长 | GrowClaimComponent / 0x68AF30；GrowClaimFrontier / 0x68B020 |
| 紧凑候选 | SelectCompactFrontierProvince / 0x68BA40，944B |
| 海岸入口 | GetSeaApproachDistances / 0x68A7A0；SortSeaEntries / 0x68C110；IsPortProvince / 0x68B970 |
| 理由 | CasusBelliDefinitionV2.CanUse / 0x6684F0；BuildDefaultGoals / 0x6678C0；ChooseOccupyCount / 0x668830 |
| 目录与声明 | CasusBelliServiceV2.BuildCatalog / 0x668DA0；TryBuildDeclaration / 0x669F60 |
| 进展 | WarGoalDefinitionV2.CalculateProgress / 0x681020 |
| 分数与厌战 | WarScoreCalculatorV2.CalculateWarScore / 0x68C670；WarWeariness / 0x68E580；ShouldForceSettle / 0x68D690 |
| 和约 | PeaceResolverV2.BuildSettlementPlan / 0x66C970；ExecutePlan / 0x66EEF0；CollectTransfers / 0x66E510 |
| AI | WarAIV2.EvaluateDeclaration / 0x674F30；ChooseCasusBelli / 0x6747E0；EvaluatePeace / 0x6757F0 |

SelectCompactFrontierProvince已静态核到：遍历frontier ID，跳过不存在/非陆地/非防守国；优先与selected集合共享邻省较多者，再优先GetProvinceDistance更短者；同邻接数且绝对距离差小于float32(.001)时，小ID也可取代。必须保留先严格短距离、再容差/ID的分支次序，不能量化距离后排序。无合法者null。id+0x10/stateID+0x78/isLand+0x89/neighbors+0xA0。GetProvinceDistance 0x68A590尚未恢复，需独立port而非猜屏幕距离。

BuildConnectedClaimProvinces调用点0x689AF7→GrowClaimFrontier、0x689C32→GrowClaimComponent已核；入口排序/海岸合法性未全部展开。海岸最大4跳是原类常量，不能直接当作网页海网四条边。

战争分必须有开战快照、Goals、双方击杀死亡等真实记录；和约计划与实际执行另列，不从当前领土反推过去。既有CAPITAL_CRISIS.md含部分stress公式，恢复前先核查避免重做。下一批按此链接WEB-04-37，仍需新规则版本和旧档隔离。
