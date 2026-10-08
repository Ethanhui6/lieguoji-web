# 连续观察与紧凑界面 · 2026-10-08

本批是用户最新试玩反馈的本地修复，接续 WEB-04-37；不把整个战争还原任务标为完成。根唯一源码写入，三位既有 agent 只读核对。

## 本批范围

1. 地图点选国家、城市、军队、舰队、战役，切换图层和详情，阅读/定位大事记，保留当前时间开关。原来运行则继续，原来暂停则保持暂停。重叠部队选择不阻止模拟，但仍防触控穿透。
2. 已保存的 `chronicle.leaders` 提供开篇在位君主记录。只读派生开篇人物志和顶部提示；不新增历史 ID、不制造宣战/传位、不改旧档。国家名称明确是现名，旧档没有可靠的开局国名或首都快照。后起国家不加入开篇，真实重大事件优先播报，日常领土易手仍默认隐藏。
3. 根据用户本轮明确改为 iOS 风格的 UI 要求，调整系统字体、半透明浮层、圆角、紧凑工具栏、折叠图层与时间设置。新局/读档默认不弹开国家长面板；详情面板开合为可反向的同一 CSS 过渡，切换标签不重建外层，模拟 tick 不重播动画。常规提示自动收起，错误保留且可关闭；同一文案重新发生能再次显示。

查看详情不等于命令执行。编辑、保存、退出、军令/外交确认以及用户显式设置的遇战暂停继续保护一致性。常用预览意图在暂停后等待已发出的 Worker 请求结束，由最新 React 快照构建；Worker 的 tick/day/event/revision 重验保持。当前可能的后台 tick 不取消、不伪造回滚。

## 证据与验收边界

- 核实的根因：FmsGame 纯观察入口主动 `pause()`；`initialChronicle` 只初始化君主，没有开篇 entry；顶部对当前版本只读取历史重大 entry。修复显示来源而不提高随机战争频率。
- 初稿采用 `apple-design`；用户随后指定 `apple-ui-designer` 与 `emikkwalski/skills`，已确认后者为 `emilkowalski/skills`，完整读取并实际采用 `apple-ui-designer` 和 `emil-design-eng`。来源与设计逐项记录见 [DESIGN.md](DESIGN.md)。用户本轮 iOS UI 要求覆盖先前原作按钮外观偏好；地图/规则对照仍以原作为目标。
- 浏览器验证用独立 Chromium 数据上下文、普通 UI 新建世界。旧 5248 用户标签和个人世界不读取、不重载、不覆盖。新增试玩 5250 与 5248 存储 origin 不同。
- 同世界比较使用由测试 UI 创建并保存的夹具，复原保存时的 Int32/Uint32 类型后载入两个隔离上下文。对比同一 run、全图相机、428×926；这是网页界面前后比较，不是原作视觉通过或 iPhone 真机测试。
- 第一次浏览器检查发现编辑打开后仍有一次已发送 tick 返回（391→401），不是伪通过。新增等待确认快照后再开编辑/预览。第一次同世界比较因测试 JSON 丢失 typed-array 类型而被真实存档校验拒绝，修复测试夹具，不改校验。
- TypeScript 捕获延后国策回调误传 action 函数而非 value；已修复，最终检查以日志为准。

原海陆画面、Army 统一海陆寻路、海上战斗身份以及完整战略 AI 都没有因 UI 修改自动完成。v46 引擎与保存格式须和旧构建完全相同。

## 用户新增海域规则的续接合同

当前 v46 `portControl` 控制真实港湾，`SeaGraph.nodes` 没有 owner/controller。原包已有海省作战，但 [原作国家省表清理](../fms-terrain13-v5-2026-10-07/CORE_DISTANCE_RECOVERY.md) 不支持“原作全部海洋最近国所属”的断言。因此下列明确是用户扩展，待新规则版本接入：

- 从全部真实沿岸出发，沿相连湿海面求近岸归属；不能仅从有港城市出发，也不能跨陆地计算直线“最近”而分错海岸另一侧。
- 沿海管理范围须有可见、可调的有限外延；远洋保持独立，湖泊不能套外海规则。等距采用稳定实体 ID。
- 海域用独立实体/控制表，与真实湿三角绑定；不制造海上城市、人口或税收省。法理管理国与战时控制国分别存储。
- 只有真实到达的敌对部队可争夺；舰船途经不一次吞并整个海洋。和平通行与管理权分开，不能把两个大陆再次封成互不可达。
- 海域控制不自动授予旁边港口补给/造船权；港湾已有控制独立保留。停战与海域结果必须接入实际和约状态，不能只改显示色。
- 显示、拾取、路径、战斗、Worker、保存和旧档副本共同验收；新规则新库，不改旧 v46。核验孤岛、双大陆、海峡、无港沿岸、等距、重复保存、备份恢复、CAS 和中途海陆路径。

## 已开展的统一 Army 工作（尚未接入试玩）

三份未完成源码 `army-travel47-graph.ts`、`army-travel47-state.ts`、`native-war/army-path.ts` 保留，不进入本批生产入口。真实 h=20 裁切陆/海格共享正宽边，独立行程不把海格混入陆地省；仍需专项测试和新版本模拟/显示/存档接入。不能把类型检查通过当此功能通过。

原 DLL SHA256 `d42658a922155f6cc60295a64c02207e5eaa1d3a55fd5ed18dc8ecc562f9b82b`。本地受限读取的 PE/IL2CPP 方法：

| 方法 | RVA | 已核实与未核实 |
|---|---|---|
| Army.MoveToProvince.MoveNext | 0x377860 | 同一 Army 统一陆海 cell path；无法寻路停止；不要求先生成 Navy。原网页 transport 适配不等价。 |
| Army.BattleInSeaProvince | 0x344B70 | 海域内仍使用 Army 战斗身份；不直接围城。完整敌友过滤未在本叶恢复。 |
| Army.GetDisplayedArmySpriteIconResourcePath | 0x34B720 | 离陆后 transport-ship 图标，上岸恢复本单位图标。 |
| Army.GetSpeed | 0x34BC00 | 海上 base×1.5；陆上单位倍率与山地/高原/biome 分支；绝对初速和网页时间映射未恢复。 |
| ArmyPathfinding.GetPortTransitionPenaltyForCells | 0x802F90 | 非港海陆转换软代价450；不是禁止通行。 |
| ArmyPathfinding.GetSeaRouteCellCostMultiplier | 0x803180 | 指定海路集合内 .02；不能套所有海格。 |
| ArmyPathfinding.CalcCellDistance | 0x7FDC10 | float32 octile；GetNeighborDistance 另有平均邻距简化分支，不宣称完整 A* 等价。 |

完整本地分析 `.autopilot/paths47-native.txt`、`pathcost47-native.txt`、`pathdistance47-native.txt` 不进入 dist 或 Git。原包未写入；未运行原作，未新增视频观看结论。
