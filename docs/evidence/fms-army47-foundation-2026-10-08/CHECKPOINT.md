# WEB-04-37 统一 Army 位置内核检查点

2026-10-08。本批 7 份 TypeScript 文件是尚未接入的 v47 基础内核，**不是新的可玩版本**。现有 v46 tick、Worker、存档库、5252/5250/5248 均保持原规则。用户插入三技能 UI 概念任务，先保存此实际代码，不重复恢复或宣布跨海完成。

## 实际实现

- h20 裁切后的真实陆/海半面，经正宽度共享 gate 连通；海面还必须存在 seaGraph 链接，避免 h20/h20 干脊形成虚假水路。
- 任意格内起点 origin，连续行走到 gate 再归属下一格；crossed 显式区分停在边界前/已经入格，停止及重定向不回跳中心。
- 进入边界重验权限，已进入下一格不因随后撤权退回。审查发现 gate 起点、零速、crossed=true/offset=0 的组合曾被误判启程；已加 !crossed 防护与保存 JSON 往返回归。
- Army ID 一一对应的实际位置账，排除与 cargo 重复身份；陆上按省、海上按实际面建 presence 索引，死亡军队不参与。海面索引是网页几何适配，不冒充原作海省划分。
- 已恢复原作标量成本：目的地 oceanRouteCellSet 成本×.02、无港跨岸 +450 软惩罚、海速 base×1.5；绝对时间/速度未完整恢复。octile 是明确的几何适配，原作某静态标志还可采用平均邻距。
- 原作海省战争谓词合并 Army/Navy 的非空唯一国家，只要存在敌对组合就为真。它是全省触发，不是单军伤害目标过滤。

## 原作静态证据索引

只读指定安装目录 PE/IL2CPP。DLL SHA256 `d42658a922155f6cc60295a64c02207e5eaa1d3a55fd5ed18dc8ecc562f9b82b`。

| 方法 | RVA / 字节 / SHA256 | 观察 |
|---|---|---|
| Army.MoveToProvince.MoveNext | 377860 / 5024 / b5ff7de1e720504a9d2e9e683c4cfb1e13fd1b53fcd6c593692bec3a55411eab | 连续 Transform 位置、入格、海陆外观与速度重算；未发现船容量或 Navy 必须存在的检查 |
| Army.SetCurrentCell | 3505C0 / 192 / 0be720d1c2d55af9653c79515f94138bc61feebcc39773aee2ad0fa1f795df3b | 更新格身份；换省时标记 presence 索引失效，不直接结算交战 |
| Army.Attacking | 343700 / 2320 / c5abae07bf186335366def153bdae879e6a469cea94f59ad3bf836bf830dba0f | 海省战争使 target 改当前海省、停路径并周期加入战斗；此分支无 RTS 豁免，也未证实自动恢复旧目标 |
| Province.IsAtSeaWar | 4581C0 / 1264 / 32c6543f68677f0419edd78791284654f783c01db0c0e96f0bae5ba1c375feb7 | land=false，Army/Navy 身份合并后任意敌对组合；无距离、屏幕接近或邻省/港口检查 |
| State.IsAtWarWith | 5D17A0 / 96 / 5db5cf127daf14b0b64adc0d5df282037f6c43c1dff25df26d02526c21d0c1f0 | GetEnemyStates.Contains；敌集完整构造未恢复 |

上述是静态推断与可见指令分支，不是原作实机等价。原始分析输出保留 .autopilot，不放入 dist。

## 未完成的接线与保护

- 尚无 run47 / Store49 / Worker / 指纹 / 渲染 / 生产入口。先冻结现有46，再建立隔离47；不可运行未经逐处审核的裸数字版本替换脚本。
- tick 中必须统一使用实际位置：战斗、占领、食物、驻防、重组、AI、碰撞与路线展示均不能继续用岸上 provinceId 锚点制造幽灵陆军。
- load/copy 须以可信外部 binding 和真实 cargo IDs 调用校验；不能只用 positions 自报 binding。revision 由统一事务递增。
- 旧运输/中途行军显式复制需无损适配或拒绝，不允许最近中心静默吸附。
- 与 UI 无关的内核测试不等于可玩跨海、真机或地图视觉验收。测试明细见 checks.json。
