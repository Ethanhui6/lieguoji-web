# 原作画笔：三个函数的有界静态审计

日期：2026-10-04。结论状态：**已获得原生调用与局部高程运算证据；未恢复完整笔刷，未运行原作，未验证网页行为或画面一致。**

本次仅反汇编 `PlayerController.DrawMapHeightLogic`、`PlayerController.DrawMapHeight`、`World.GetCellIndexInRadius` 三个函数。其他方法只解析现有索引中的名称、签名和字段，不读取其机器码。安装目录只读；不读取认证、SDK 配置、个人存档，不执行 EXE、DLL、Puerts 或完整 main。可提交材料只有本报告和脱敏 `brush-static-manifest.json`；临时工具、汇编及完整索引仍在已被 Git 忽略的 `.autopilot/fms-audit/binary/brush-static/`。

## 证据基础

- 输入 `GameAssembly.dll`：53,442,048 字节，SHA-256 `d42658a922155f6cc60295a64c02207e5eaa1d3a55fd5ed18dc8ecc562f9b82b`。读取前后内容摘要一致；文件未写入。
- 复用 Il2CppDumper 6.7.46 已有的 `binary/dump/script.json`、`dump.cs`；本次只运行 Python + Capstone 5.0.7 静态解析器。
- 用 PE 节表换算 RVA，并交叉核对 `.pdata` 函数范围。下表摘要范围包含下一个方法前的对齐；`DrawMapHeight` 尾部的七项跳转表作为数据处理，不冒充指令。

| 函数 | RVA | `.pdata` 结束地址（不含） | 索引范围字节数 |
|---|---|---|---:|
| `PlayerController.DrawMapHeightLogic()` | `0x439A50` | `0x439DE9` | 928 |
| `PlayerController.DrawMapHeight(Vector3 pos)` | `0x439DF0` | `0x43C1F4` | 9,232 |
| `World.GetCellIndexInRadius(float x, float y, float r)` | `0x6B4CA0` | `0x6B4E24` | 400 |

IL2CPP 泛型和空实现可能共享同一个机器码地址。本次结合 `ScriptMetadataMethod` 的 MethodInfo 引用识别 `GetComponent<CellObject>`、`List<int>` 和枚举器等；不能取共享地址的第一个符号就认定实际调用。报告没有把这些共享地址误报成 AI 或 SDK 调用。

## 已证实：真实调用关系不是此前假定的三段链

1. `DrawMapHeightLogic` 在 `0x439A93–0x439AC5` 检查 `isDrawing`（实例偏移 `0x68`）与 `currentLeftClickAction == DrawMapHeight`（`0x90`，枚举值 8），读取 `Input.mousePosition`，在 `0x439AC5` 调用 `DrawMapHeight`。本函数还按其他动作分派国家、省份、文化、信仰、家族和地区画笔；本次没有分析那些方法体。
2. `DrawMapHeight` **没有直接调用** `GetCellIndexInRadius`。实际可见路径是相机屏幕坐标转换、`GetCellIndex` 越界检查、`Physics.Raycast`（调用点 `0x43A2F2`）、`Physics.OverlapSphere`（`0x43A3A0`），然后从碰撞对象的 `CellObject.Site.CellIndex` 收集去重格子集合。它同时收集范围内的 Army 对象。
3. `GetCellIndexInRadius` 是独立 KD 树查询封装：有限坐标在 `0 <= x <= World.Width`、`0 <= y <= World.Height` 时，使用 `World.tree`（偏移 `0x400`），向 `KDQuery.Radius`（调用点 `0x6B4DC8`，目标 `0x789130`）传入 `(x,y,0)` 和原参数 `r`；越界返回新建的空 `List<int>`。本函数未见半径的局部钳制；KDQuery 内部规则未审计。

因此，不能把“网页上查找圆内采样点”直接称为原笔刷的选区复现。原路径依赖实际 Collider 的形状、位置和层掩码；KD 树的点距离查询与 Collider 相交查询不能无证据地互换。

## 已证实：输入与高程修改

- `EditPanelUI.BrushHeightSlider`（偏移 `0x128`）经 `SliderValueConnector.get_Value` 取得浮点高度输入 `s`，调用点 `0x43A223`。
- 半径来自 `BrushManager.GetCurrentBrushRadius`，目标 `0x47F030`、调用点 `0x43A241`；其结果直接作为 `OverlapSphere` 的半径。半径 UI、相机缩放换算和默认范围在被调函数中，本次未知。虽然有一次以半径向量调用 `InverseVoronoiTransformPoint`，该次返回值随后被覆盖，不能声称它已用于缩放球半径。
- 球查询层掩码由 `PlayerController.layerMask | armyMask` 构成；用返回对象的 `Site.CellIndex` 建立集合。高度操作读写 `World.CellData`（`0x148`）下的 `CellData.Elevation : List<int>`（`0x18`）。
- `currentBrushShape == Hill`（偏移 `0x84`，枚举值 0）时，在 `0x43A715` 调用 `HeightMapGenerator.GetHeightMap(HashSet<int> cells, int centerCell, int centerHeight)`，目标 `0x38BC80`；中心格来自射线命中的 CellObject，`centerHeight` 是高度输入向零截断后的整数。**这个方法的山形衰减、随机性和邻接传播没有恢复**。
- 非 Hill 分支对应已声明的 `Plane`。七个模式通过 `0x43C1D8` 的函数内跳转表解析；不是仅依据枚举名称猜测功能。

下表是本函数内可证实的运算；限定普通有限且无整数溢出的输入。`h` 是修改前整数高程，`g` 是未审计的 `GetHeightMap` 为本格返回的整数，`t` 表示向零截断。

| 模式 | Hill 分支 | Plane 分支 | 分支证据 RVA |
|---|---|---|---|
| Add | `h + g` | `h + t(s)` | `0x43ABB4` / `0x43AE23` |
| Subtract | `max(0, h - g)` | `h - t(s)` | `0x43AA8B` / `0x43AEA2` |
| Min | `min(h, g)` | `min(h, t(s))` | `0x43A9AA` / `0x43AF0C` |
| Max | `max(h, g)` | `max(h, t(s))` | `0x43A8C9` / `0x43AFB9` |
| Average | `t((h + g) / 2)` | `t((h + t(s)) / 2)` | `0x43A80E` / `0x43B066` |
| Replace | 本分支未进入上述五种高程算术 | `t((double(s) / 100) * 80 + 20)` | `0x43A805–0x43AC45` / `0x43B0F9` |
| Erase | 本分支未进入上述五种高程算术 | 调用 `World.SetCellAsSea(i)`；其内部写入未审计 | `0x43A805–0x43AC45` / `0x43B1F4` |

Replace 公式中的数值来自本函数实际引用的地形运算值，不是资源解封常量。Hill 模式下 Replace／Erase 是否能由 UI 选中未知，不据此认定产品缺陷。三函数内未见统一的高程 `0..100` 钳制；不能把已恢复的 JS 生成器高度约束自动应用到原生编辑笔刷。

## 已证实：修改具有地图与实体副作用

- Hill 与 Plane 两条路径均比较修改前后 `Elevation < World.sealevel`（World 偏移 `0x19C`）；跨越海陆分类时设置局部标志，随后在 `0x43B2B4` 调用 `World.MarkFeatureDataDirty`。阈值取运行时字段，不能仅从此函数证明它永远等于 20。
- 另有独立的固定高度条件：修改后高程至少 20，且 `CellData.Biom`（偏移 `0x40`）为 0 或 -1 时，将 Biom 写为 6（`0x43B3B0–0x43B417`）。这与上面的运行时海平面字段不能混为一谈。
- 收集 `CellData.DrawProvince`（`0xC8`）与 `CellData.Province`（`0xC0`）。在 `0x43A654` 调用 `TriggerRedrawProvinceBorder`，在 `0x43B4FF` 调用 `UpdateDrawProvince(id, true)`，并把 `BorderDataProcessor.m_IsProvinceBorderLineNeedRecal`（`0xEF`）设为 true（`0x43B563`）。这些调用的渲染实现未恢复。
- `Erase` 的附加路径从省的 cells 中移除低于固定高度条件的格子；可见对 `Province.cells`、`Province.center`、`BurgData.cell` 和 `CellData.Province` 的修改，以及省界更新标志。它还调用 `UpdateCityIcon`、`UpdateLandProvince`、`RecalculateFeatureDict` 和 `FilterProvinceCells`，没有展开这些目标。
- `Erase` 路径把范围内 Army 的 `armyCount` 字段（`0x80`）写为负值标记（写点 `0x43BEA9`），随后调用 `ArmyPathfinding.RecalculateProvinceNeighborDistancesAsync`（`0x43BEFC`）。这里能确认写入和调用，不能据此宣称已经完整恢复军队销毁或寻路生命周期。
- 通用收尾调用 `World.SetDrawProvinceMode`（`0x43BF31`）。本函数入口还调用 `TriggerDelayedRedraw`（`0x43A0CD`）。延迟时序和帧率行为未知。

## 推断、未知及适合下一步的边界

**推断：** 原笔刷操作以已有细分格子为编辑单位，并维护局部绘制区与实体引用；有界选区与局部重绘很可能是其交互体验的一部分。名称、调用和字段为此提供证据，但没有运行时采样、耗时或视觉对照，不能宣布体验一致。

**未知：** 原 Collider 如何由地图多边形生成；屏幕到地图的完整投影；实际笔刷半径与缩放规则；Hill 每格衰减公式；拖动插值、节流和撤销；各模式 UI 约束；Shader、海洋与海岸线绘制；高程修改后的完整行政和军队生命周期。三个函数也不足以证明存在“闭合轮廓自动生成自然地形”的流程。

**下一步建议而非已执行工作：** 要恢复自然 Hill 形状，优先单独审查直接依赖 `HeightMapGenerator.GetHeightMap`（`0x38BC80`），并为选区明确原 Collider 与网页多边形的对应证据。若先做网页数值试验，应把受影响格子集合显式作为输入，仅实现上表已证实的算术，把其余副作用列为未接通；不能把这个试验作为完整画图模块验收。

本次停止在三个函数和直接目标名称解析，没有继续追踪这些依赖、没有产品代码改动、没有原作运行对照、没有云端操作。
