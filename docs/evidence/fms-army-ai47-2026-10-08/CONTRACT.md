# 原作目标评分与真实海陆自主军令

2026-10-08。根唯一写入。接续606a4b1人物战力，没有改旧46规则、刷新5254或启用完整47。WEB-03-06 / WEB-04-37继续进行中。

## 本批实际实现

1. `native-war/army-target47.ts` 实现原FindRegularTargetProvince评分与分组优先级。逐步float32；同Feature目标优先，然后异Feature港口，再全部异Feature；平分保留输入顺序。没有暗加胜率、军队数或随机扰动。
2. `army-commands47.ts` 提供候选内部发令核心。手动与自主使用同一真实位置、地图绑定、外交通行、整编与撤退校验；只有手动命令才接管军队。自主入口再次拒绝manualArmies，实际forceContacts即使旧status是idle也拒绝强行改令。公开玩家入口仍先验证预览stamp、复制候选，失败不提交。
3. `civilization47-army-ai.ts` 接日结命令阶段，保存目标、战争来源、理由、发令tick和下次评估时刻。实际陆地目标可经海陆统一图跨岸，既不要求港口，也不创建假cargo或复制军队。有效进行中的路线保留，夺地/和平后重选；低粮在实际本国陆地停驻休整；失效任务从当前位置寻找合法返乡路线，找不到则停住，不跳回旧城市。受阻撤退者不再陷入“等待占领”，因为撤退者本来就不参与占领。

每日日结回执防止同日重复发令；新月征募同时建立AI记录。所有数据继续属于同一个真实文化47候选。`settleArmyAutonomyDay47`确实调用自主陆军命令，不是noOrders替身；但它只完成陆军日结责任，**还不是完整舰队/政治/会话/存储所有者**。

## 原作依据及精确数值

复用 [Attacking上层逻辑](../fms-tactics-v5-2026-10-06/ATTACKING_FOLLOWUP.md) 和 [常规目标选择](../fms-tactics-v5-2026-10-06/TARGET_SELECTION_FOLLOWUP.md)。本次指定只读核查确认DLL SHA256 `d42658a922155f6cc60295a64c02207e5eaa1d3a55fd5ed18dc8ecc562f9b82b`；未运行原作/恢复脚本，未读私档或认证。

- Army.Attacking343700：目标为空，或目标非交战且不属GetEnemyStates时，非RTS者重选。FieldArmy=1走FindRegularTargetProvince3482B0；Garrison=2走FindRebelProvinceWithHighPriority347B60；仍空才走FindTargetProvince3497D0；最终空则Idle，不销毁军队。占领完成后在下一次更新重选，不是预排全国征服路径。
- 原评分：`currentDistance × (protruding ? 2 : 3) × (crossFeature ? 10 : 1) + homeDistance`。当前坐标差348A10/19、平方与和348A61–69都是float32；平方和转double（348A70），sqrtpd（348A7D），回float32（348A9B）。突出分支用d+d（348AAA–AB1），非突出d×3（348AA3）；跨Feature×10（348B22）；最终home+weighted（348B61）。
- home距离339D30：dy²339D93、dx²339D9B、float32相加339DA0，转double339DA4/sqrt339DAD/回float339DB1，ret339DDE。不能替换成Math.hypot或只最后一次fround。
- 三组初始分为float.MaxValue=0x7F7FFFFF（3488D2），非Infinity。严格更小才替换，NaN/Infinity/相等均不入选。异Feature港口**同时参加全部异Feature组**（348B7B–BA1）；返回顺序仍同Feature→港口→全部异Feature（348C1E–2A、348C7C）。

## 明确的网页桥接

- 当前Army统一按常规FieldArmy选目标，完整平叛Garrison/通用原fallback还待接。regular敌集使用当前未结束的外部nativeWars参与者，同时确认现实外交敌对；同一对手另有internal战争不会从外战集合中被错误扣除。不用退战历史coalition.members或旧领袖敌国缓存。
- Feature由真实47图的同表面连通分量替代，海陆独立，省份用实际中心所在格。不是国家ID，也不是单个外交海区ID，更不是已恢复原CellData.Feature编号。
- 候选顺序为实际受袭本国地区、与己方相邻的敌省、无本国受袭时可通行盟友的共同敌人地区、敌国沿海地区。受袭来自真实land holders，海上军队和撤退者不会冒充岸上入侵者。原regular分类、边境列表刷新和盟友精确资格仍未全部恢复；这里明确是网页桥接。
- 突出部暂为false，港口采用已有真实合格harbor。原评分先选；实际路径失败后尝试其他候选是网页可恢复策略，不改原评分本身。不依赖旧war26的“两端港口+运输”海目标门槛。
- 每日评估、军粮35/士气50/兵力180的出发门、实际本国休整与返乡，是保留/补齐的网页规则，**不是原选省函数中的公式**。进行中的海上任务不会每日重置或凭空返港。

## 验证范围

tests/checks记录真实结果。两岛固定样例有明确人工布置的国界和军队位置，没有港口/舰队；先验证AI给出跨水路径且终点为敌方land，再用真实速度的统一移动primitive走完整条路径。该primitive测试**不推进日历、粮食或战斗，不能称900天世界/登陆战验收**。另有真实military日界→完整日粮/月账候选→AI命令→下一军事tick的接线测试。月募兵测试仅布置30日入口，不把前29日夹具时间称为完整模拟。JSON重放不是Store49/IndexedDB验收。

用户900天孤岛问题尚未在完整47端到端重跑；原速度与网页地图尺度/现有口粮之间的长程行为还必须在完整日结中量测，不能由单次无日结行程推断存活登陆。新地图视觉、iPhone真机、原作实机等价均未验收。

下一批：舰队的真实sea-only航令、同格内驶到实际港口锚点、回港补给及后续造船；再政治/战争收尾、完整live47校验/session/Store49/Worker/创建UI。保留原新旧存档边界，不启用旧46军舰移动或旧cargo远征循环。
