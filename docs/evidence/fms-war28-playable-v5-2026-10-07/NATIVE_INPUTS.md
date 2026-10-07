# v28 普通领土战争生产输入

2026-10-07，根唯一写入；只读代理分别恢复政治属性与普通 CB 目标分支。指定安装包 GameAssembly.dll SHA256：`d42658a922155f6cc60295a64c02207e5eaa1d3a55fd5ed18dc8ecc562f9b82b`。依据是 PE/IL2CPP 静态机器码与本地已存在元数据，不是桌面实机验收。用已有 Capstone、内置 Python 从 stdin 只读解析；没有执行原作或恢复脚本，没有读取认证、SDK 配置和个人档。raw dump 不进入 Git/dist。

## 政体和国家初值

`GetDefaultForPoliticalSystem` RVA 44CCB0–44D160，1200 B，SHA256 `17e5fdd5f9b721e6267c5e312d59cf423d8f6958923211f49dda21ed492eb919`。跳表 44D140 对应枚举 Kingdom/Empire/Federation/Republic/Tribal/Theocracy：territoryLossThreshold 分别为 f32(.50/.45/.55/.50/.60/.50)，写入地址 44CD86/44CE36/44CEE6/44CF96/44D046/44D0F6，offset 50。属性 ctor 44D160–44D1F0，144 B，SHA256 `2ce969560ca989f842779d5984e950e2ad9db14cf6f599059004c465650256d9`；44D1D2 默认写 .5。

State 无参 ctor 5E2510–5E2F20（SHA256 `e664c6b01c48983c180cab5d495333fd64b541b15e7c582a8a5b21cd834c96fe`）在5E271F写 [rbx+50]=0x0101；带参ctor5E2F20–5E39B0（SHA256 `faf5efcf5d998fa4c53dc4e7e27c052cc2db9bb4801636796b4bb077900fc1f6`）在5E3140同写。+51 是国家自主外交，因此新国家构造初值 true。不是当前桌面存档的运行设置。网页本批消费政体默认，尚无国家自动外交独立开关，也未完整恢复 ethnic/traits 的失地阈值覆盖。

## Ordinary TerritorialConquest

BuildDefaultGoals RVA6678C0–668270，2480 B，SHA256 `b45ec7ff338d7931f67184492cb01551e9a2321f23c7a06ce0c7d8becbc47d5f`。BuildCatalog ordinary 段668EDB–6690CE，SHA256 `ce88f864c7a6f3d2a62e9d8e607dbafe3549a923ce3cc73a17b3d1034587e93a`：CB id1，AllowedGoalTypes=[2,1,3,6]，专用吞并=false，AnnexThresholdProvinceCount=1。

- 6679BA 先 CanUse；未恢复完整资格，不默认声称原作允许。
- 667BDB 调 GetCedeableProvinces 689FB0（528 B，SHA256 `341d3c13ab82bdfbbfe5646ba67dccc798a3508342b832e9880ec562cecdcff9`）：守方省原顺序，陆地接壤，或海邻国且为海岸。网页目前使用实际可执行的异陆块同海域港口，范围更窄；不是完整原查询。
- 667C47–667D56 配额等价 ChooseOccupyCount；仅一个可割省时不查配额兵力。667D62 连片目标，完全为空才 fallback cedeable.Take(count)，部分不足不补齐。
- 667DC0/667DD6 再查双方兵力；667DF4/667DFB 的 share >= f32(.65) 选择 type1 CedeArea，否则 type2 OccupyCount。
- 主目标 id1；addedBy=A、target=D、beneficiary=A。CedeArea requiredCount=0；OccupyCount=min(requested,claims.length)。
- 667F81 单次随机 value < f32(.35) 可附加 id2/type6 赔款；范围是完整 cedeable，requiredCount=1。相等不触发。
- 没有主目标时，仅守方恰好一省允许普通 CB Annex type3/WholeState，不附赔款。

`native-war/conquest-goals.ts` 实现上述普通分支，显式输入 CanUse/geography/strength/random。`war28-goals.ts` 是生产适配：网页实际通行资格、稳定省份编号、当前运输和海军兵力、固定独立 seed 随机流。旧 v26 的作战计划继续控制移动，完整 AI CB 选择、原作 Unity 全局随机流和完整连片入口仍有差距。

## 和约与网页数据映射

评分/厌战/目标/Build→Execute 复用既有逐函数内核。实际战斗原始 f32 伤害与实际兵员减员分开。完整新战争可自动议和，旧档复制的既有战争不补造开战史，不计算完整战争分或自动和约。

原作单一所有权在网页双字段中采用有界适配：战争期间保持 controller 实控，自动和约确认战初双方土地的 legalOwner。强制转地与已占领确认均保护第三方法理；不追溯修改第三场战争。总督按当前职务编号正确撤除，核心距离重算。完整原作家族封地尚不存在，不伪造其清理已恢复。新和约保存真实转地、效果结果、胜负及原因；不会在读档后重复执行。手动干预 reason11 不割地、不赔款。

普通新战争按真实历月做12/36月判定；网页每天战斗后评估，完整原作上游调度未恢复。六政体阈值用于崩溃；国家领土归零可结束战争，不被当前存活参与者门遗漏。本批生产目标只生成1/2/3/6，4/11效果缺完整状态时明确失败，不能假成功。最大期限世界设置、完整内战、附庸/改宗与原作停战时长仍待接，现有旧层10日停战约束保留。
