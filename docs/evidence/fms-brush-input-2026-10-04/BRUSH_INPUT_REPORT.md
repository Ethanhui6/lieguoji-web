# 单次画笔输入：静态证据与网页切片合同

日期：2026-10-04。本项支持进入 WEB-PH01 的真实画布切片；不是原作投影、Collider、拖动时序或视觉一致验收。

复用已冻结的 DrawMapHeightLogic、DrawMapHeight、GetHeightMap 报告与汇编。本轮最多新增的一个函数体是 `World.SetCellAsSea`（RVA `0x6C2290`）。另外仅检查场景中具名画笔 UI 对象、这些对象的组件头，以及确认属于 SliderValueConnector 的三个组件字段。未运行原 EXE/DLL/main；安装目录只读；未解码 SDK、认证或存档数据。仅本目录新增文件，旧证据、src、计划及 handoff 均未修改。

## 已证实的单次输入链

1. `DrawMapHeightLogic` 检查 `PlayerController.isDrawing`（`0x68`）和 `currentLeftClickAction == DrawMapHeight`（`0x90`，枚举 8）。调用点 `0x439AC5` 把 `Input.mousePosition` 的 Vector3 传给 DrawMapHeight。因此这里的初始 `pos` 是屏幕坐标，不是 CellIndex 或地形坐标。
2. DrawMapHeight 在 `0x43A106` 调用 `Camera.main.ScreenPointToRay(pos)`。数据流显示随后保留射线原点 x/y、把原点 z 改为 -1；射线方向仍来自原相机。使用 `Ray` 的栈对象和 getter/setter 参数来源辨认这些操作，而不是取共享地址的第一个符号名。
3. 原点向量经 `World.InverseVoronoiTransformPoint`（`0x43A1D9`）转换，再调用 `World.GetCellIndex`（`0x43A29F`）。**返回 -1 只用于早退；这个查询结果没有成为后续 Hill 的中心格。** 原转换公式和相机正交/透视配置本轮未恢复。
4. 对修改后的射线调用 `Physics.Raycast`（`0x43A2F2`），掩码来自 `PlayerController.layerMask`；未命中则早退。命中后从 `hit.collider.gameObject.GetComponent<CellObject>().Site.CellIndex` 得到中心格：`0x43A334` 取得组件、`0x43A342` 取 Site（`0x48`）、`0x43A34F` 取 CellIndex（`0x30`）。这个中心是碰撞拾取结果，不应被描述成最近采样点。
5. 选区使用 `Physics.OverlapSphere`（`0x43A3A0`）。球中心取上述射线原点的 x/y，但 z 设为 0；半径直接使用 BrushManager 返回的 float；层掩码为 `layerMask | armyMask`（`0x50`、`0x54`）。它不是以 RaycastHit.point 为球中心，也不是调用 GetCellIndexInRadius。
6. 遍历返回 Collider，读取对应 `CellObject.Site.CellIndex` 加入 HashSet（`0x43A4A7–0x43A508`）；同一格子被多个 Collider 命中时去重。还会收集关联绘制区、省份与 Army。Collider 实际几何、重叠边界、返回顺序和创建来源尚未恢复，不能用“半径内点集合”无声明地冒充原选区。

以上是一次调用的数值与选区链。未证明它的调用频率、拖动插值、触摸采样、笔压、撤销或重复落笔节流。本轮没有发现独立 opacity/pressure 参数，不能把高度输入擅自解释成透明度。

## 参数名、用途和默认值证据

| 参数 | 具名来源及证据 | 已知边界 |
|---|---|---|
| 高度输入 | `EditPanelUI.BrushHeightSlider`，实例偏移 `0x128`；getter 调用点 `0x43A223` | 返回 float，交给各模式处理；Hill 传入 GetHeightMap 前向零转 Int32。不是所有模式都可解释成统一增量。 |
| 半径 | `BrushManager.GetCurrentBrushRadius`，目标 `0x47F030`、调用点 `0x43A241` | 返回值直接进入 OverlapSphere；getter 未展开，不能确认活动滑块选择或缩放规则。 |
| 半径候选控件 | `EditPanelUI.HeightBrushRadiusSlider`，偏移 `0x138`；索引另有 `GetCurrentBrushRadiusSlider (0x47EC60)` | 这是具名来源线索，不等于已证明当前半径 getter 绑定它。 |
| Hill 衰减 | `EditPanelUI.DecayFactor`，偏移 `0x130`；已冻结 Hill 证据的 `0x38BE74` | 作为幂指数使用；原默认值与实际 UI 范围仍未知。 |
| 形状与模式 | `currentBrushShape`（`0x84`）：Hill/Plane；`currentBrushMode`（`0x80`）：Add/Subtract/Min/Max/Average/Replace/Erase | UI 是否允许所有组合未知；恢复保证以已分析分支为准。 |

另有一次对 `(radius,radius,0)` 的 `InverseVoronoiTransformPoint` 调用（`0x43A278`），其返回值在可见数据流中被覆盖；不能用这次调用声称球半径已转换成 Voronoi 坐标单位。

`SliderValueConnector` 的字段明确包括 `m_InitialSettings`，其结构顺序是 MinValue、MaxValue、DefaultValue；还包括格式字符串及超范围输入开关。通用结构构造器的可选参数是 0、1、0.5，但它们**不是三种笔刷控件的实际默认值证明**。

本轮从 `level0` 中仅挑选名称为 BrushHeight、DecayFactor、BrushSize、BrushRadius、BrushPower 的 GameObject。依据 `globalgamemanagers.assets` 的 MonoScript pathID 1045，确认了三个 SliderValueConnector，再按上述已知序列化字段顺序解析；三个组件均完整消费 112 字节，未剩余或越界。具名记录保存在 `scene-ui-parameters.json`：

| 场景对象 / Connector pathID | Title key | 序列化 min / max / default |
|---|---|---|
| BrushHeight 10016 / 45856 | BrushHeight | 0 / 100 / 45 |
| BrushSize 10048 / 45860 | BrushRadius | binary32(0.1) / 10 / 1.5 |
| BrushSize 10073 / 45863 | BrushRadius | binary32(0.1) / 10 / 3.5 |

这些是**真实场景中的序列化候选值**，并非已运行时观察的活动参数：本轮没有核实 EditPanelUI 对这些具体组件的活动引用，也未展开初始化或动态重设逻辑。两处半径默认值不同，不能随意选一个称为原默认半径。DecayFactor 对象名字已找到，但未在这次限定的已识别 Connector 集合中取得其参数。网页可以采用明确记录的初始设置，不必为这些未知继续阻塞画布。

## 唯一新增叶子：Plane Erase 的高度

`World.SetCellAsSea(int cellindex)` 的 `.pdata` 范围为 `0x6C2290–0x6C2340`，176 字节，SHA-256 `485f96ff445deaaac3300707c882ece0fcd2ea9b0820c70f8c2c7ccad5b8602a`。

已证实它依次执行三个 List<int> 写入：

- `CellData.Elevation[cellindex] = 0`：读 World `0x148`、CellData `0x18`，调用点 `0x6C22DC`。
- `CellData.State[cellindex] = 0`：CellData `0xA8`，调用点 `0x6C2305`。
- `CellData.Biom[cellindex] = 0`：CellData `0x40`，尾调用点 `0x6C2335`。

因此下一切片可把 **Plane Erase 的纯高度结果明确实现为 0**。这补齐了上一批保留的高度未知，不回写旧冻结报告。本叶子未完成上游 DrawMapHeight 中的省份、城市、军队和寻路维护；纯高度擦除必须继续标明没有接通这些系统。Hill+Erase 没有进入同一高程分支，不能由此推断所有形状的 Erase 完全相同。

## 网页单次落笔合同（适配定义，不伪称原生协议）

详见同目录 `brush-input-contract.json`。建议把一次落笔拆成同一权威世界快照上的两个明确步骤：

1. **意图：** 世界空间中心点、以网页世界单位表示的正半径、Plane/Hill、模式、高度输入、Hill 衰减和可重放 RNG 信息，同时绑定 worldId、baseRevision、commandId。DOM 坐标只在相机层转换一次，不把屏幕像素半径混入模型单位。
2. **解析：** 拾取/选区层从同一份可见地理几何取得 centerCell 和去重 selectedCells，保留图的原邻接列表顺序；记录当前使用的选择算法标识。然后传入已恢复的纯数值内核，产生可撤销高程 patch、影响范围及新修订号。

原作入口用的是 Collider，网页首个切片可明确采用 **包含点击点的多边形拾取中心、圆与多边形相交定义选区**。这是可测试的二维网页替代，并非已恢复原 Collider 的逐点等价。若当前样机只能用采样点距离选择，也必须标明算法并固定结果，不能沿用“原生 Collider 选择已恢复”的名称。

命令预览和确认应使用同一几何修订、同一选择规则、同一数值参数及 RNG 输入；不能预览后换图再提交。保存、显示、拾取、撤销读取同一份真实高程数据。无合法中心命中时返回 no-op；不要凭空选一个远处最近格。额外的有限数、索引、规模、取消与事务保护属于网页工程约束，应显式记录。

**不阻断 WEB-PH01 的未知：** 原默认半径/衰减、原投影和 Collider 精确几何、Unity RNG 及非整数幂逐位结果、原撤销与连续缩放实机记录。这些保持待对照，首个网页切片用声明过的输入定义即可实现并验收。原作视觉和用户真机仍不能填通过。
