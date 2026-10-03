# WEB-00-03：原生 Hill 贡献图恢复

日期：2026-10-04。状态：**静态恢复了选区内的传播、随机调用时机、舍入与输出规则；未运行原作，未做原作画面或完整笔刷一致验收。**

本次拥有的可提交产物只有本目录的报告、脱敏 manifest 与人工小图 fixture。原生汇编、索引及临时解析工具位于 Git ignored 的 `.autopilot/fms-audit/binary/hill-static/`。只读已授权 `GameAssembly.dll`，不运行 EXE/DLL/Puerts/完整 main，不读取 SDK、认证配置或任何存档，不写安装目录。本批没有修改 src、计划、handoff 或云端资源。

## 范围和来源

| 目标 | RVA | 读取的函数范围 | 指令数 | 展开理由 |
|---|---|---:|---:|---|
| `HeightMapGenerator.GetHeightMap` | `0x38BC80` | 索引区间 1,424 字节 | 301 | 本任务核心 |
| `World.GetNeighborCells` | `0x6B6AC0` | 索引区间 112 字节；`.pdata` 主体 97 字节 | 24 | 确认邻接来源和顺序 |
| 未命名原生数学函数 | `0x2D1A20` | `.pdata` 区间 3,766 字节 | 782 | 确认高度与 DecayFactor 的运算语义 |

函数范围来自 PE 节映射、Il2CppDumper 6.7.46 既有索引和 `.pdata` 交叉核对；Capstone 5.0.7 静态解码。未继续追踪数学函数的异常处理 helper、Unity Random 或其他依赖。

源 DLL 为 53,442,048 字节，SHA-256 `d42658a922155f6cc60295a64c02207e5eaa1d3a55fd5ed18dc8ecc562f9b82b`；报告清单记录当前索引及每个函数区间摘要。函数区间包含索引之间的对齐时，指令解码止于 `.pdata` 的结束地址。

## 已证实的接口与数据边界

原签名：`Dictionary<int,int> GetHeightMap(HashSet<int> cells, int centerCell, int centerHeight)`。它还从全局对象读取两个依赖：

- `EditPanelUI.DecayFactor`（偏移 `0x130`）的 `SliderValueConnector.Value`。读点 `0x38BE62`，getter 调用点 `0x38BE74`。本次未恢复滑块范围、默认值或 UI 限制。
- `World.GetNeighborCells(cell)`，调用点 `0x38BF3F`。已展开的 getter 在 `0x6B6AEB–0x6B6B16` 直接返回 `World.CellData.Neighbor[cell]`：World 偏移 `0x148`、CellData 偏移 `0x108`。邻接是有序的 `List<int>`，没有按距离、ID 或高度重排。

本函数不读取现有 Elevation 来生成贡献，不直接写 Elevation。它创建两个新字典和一个 FIFO 队列，返回用于上游 DrawMapHeight 模式合成的贡献图。半径、屏幕坐标、Collider 选区、最终 Add/Subtract 等模式不在此函数内。

可移植的显式输入应为：`selectedCells`、`centerCell`、`centerHeight`、`decayFactor`、`orderedNeighbors(cell)`、`randomValue()`。将原全局依赖改成注入参数属于网页适配；保存随机种子或指定 RNG 也属于网页新增的可重放契约，不能声称已恢复 Unity 全局 RNG。

## 已证实的传播顺序

1. 新建临时字典，直接写 `height[centerCell] = centerHeight`，然后无条件把中心入队（`0x38BE7D–0x38BED5`）。**中心不必在选区内，中心高程不钳制，也不因低于传播阈值而跳过第一次出队。**
2. 每次 FIFO 出队一个格子，遍历其原始邻接列表。先检查邻格属于选区，再检查临时字典中还没有它（`0x38BFB9–0x38BFE1`）。任一检查失败都不消耗随机数。
3. 合格邻格从当前格子的临时高度推导新高度，立即写进字典作为“已发现”标记（`0x38C036`），然后仅当写入整数高度大于 20 时入队（`0x38C04C–0x38C061`）。高度为 20 的邻格保留在结果中，但不继续传播。
4. 已发现的格子永不重新计算。另一路径更高或更短也不会替换它；相邻列表顺序会决定随机数分配和第一个到达的父节点。
5. 队列耗尽后，重新遍历整个选区构建返回字典：已发现点复制临时高度，未发现点写 0（`0x38C139–0x38C182`）。中心未被选中就不出现在返回结果。空选区仍会出队中心并读取它的邻接，最后返回空字典。

因此它是**有选区约束、首次访问决定结果的图传播**，不是按每点欧氏距离独立求一个光滑圆锥。选区之外的节点不能充当传播桥，唯一例外是最初直接入队的中心。有限合法图上每个已发现选区节点至多入队一次；不需要把原图改成规则像素网。

## 高度算术：证实部分与数学函数识别

主调用点 `0x38BFF0–0x38C025` 的运算顺序为：

```text
parent = float32(height[current])
powerResult = nativeFloatPower(parent, float32(decayFactor))
u = UnityEngine.Random.value
factor = float32(float32(u * float32(0.2)) + float32(0.9))
candidate = float32(powerResult * factor)
floored = candidate > float32(20) ? candidate : float32(20)
childHeight = truncateTowardZeroToInt32(floored)
```

- `UnityEngine.Random.get_value` 的直接调用在 `0x38C00A`，发生在数学函数返回之后，每个首次接受的邻格调用一次。
- `mulss`、`addss`、`mulss` 是三个独立 binary32 运算，不能随意融合或全部改用 JS double。`0.2f` 的实际值为 `0.20000000298023224`，`0.9f` 为 `0.8999999761581421`。
- **下限在浮点结果上应用，然后才转整数，再以该整数是否大于 20 决定入队。** 中心不会经过这条下限分支，未到达点输出也不是 20 而是 0。
- 此处 20 是该函数直接使用的固定传播值，没有读取 `World.sealevel`。不要把它自动改成自定义海平面。
- 没有统一的 100 上限，也没有保证后代一定低于父节点。指数 1 且随机乘数大于 1 时，高度可增长。不能把“衰减系数”名称理解成每跳线性乘法。

`nativeFloatPower` 的目标为 `0x2D1A20`，在现有索引中没有符号。已见其通用路径进行对数、指数与浮点特殊值处理；参数组合、log/exp 结构和 `x^0 = 1`、`x^1 = x` 分支与 **powf** 一致。指数 1 的有限输入直接返回原参数（`0x2D1F30–0x2D1F6A`），指数 0 的有限输入转到返回 1 的分支（`0x2D1FA0–0x2D2010`）；另有对应向量指令路径。

**证据等级：** 传播、调用次序、浮点乘加、阈值、截断和上述特殊指数路径已由指令确认；普通幂函数身份属于高置信静态识别。未获得原符号/PDB，也未对数学函数做原生执行对照，不能承诺 `Math.fround(Math.pow(x,p))` 在所有非整数 p 上与此原生实现逐位相同。没有复制该数学库的表格、系数或实现到网页；标准 Math.pow 可作为明确记录的网页替代。

## 可直接实现的有界伪代码

```text
height := map(centerCell -> centerHeight)
queue := FIFO(centerCell)
while queue not empty:
    current := queue.popFront()
    for next in orderedNeighbors(current):
        if next not in selectedCells or height already has next: continue
        h := propagationArithmetic(height[current], decayFactor, randomValue)
        height[next] := h             // 先标记发现
        if h > 20: queue.pushBack(next)
return map(cell -> height[cell] if present else 0, for cell in selectedCells)
```

网页实现应额外验证有限数、整数索引、图完整性与规模，并限制工作量和支持取消。这些保护不应被写成原作已有行为。原方法没有在此处显式校验 center 是否属于选区、索引是否有效或参数是否有限；非法邻接可能由 List 索引或空引用处理抛错。负中心高度、NaN/Infinity、浮点转 Int32 越界、native pow 异常状态不属于本次可移植等价保证域。普通有效域为有限非负 Int32 中心高度、有限控制值、合法有限图，以及可向零转为 Int32 的有限计算结果。

邻接顺序必须保留；返回字典的枚举顺序不作为恢复保证。不要为了“确定性”排序邻接再声称结果与原作相同。用户选区与原 Collider 对应、实际拓扑恢复仍是独立缺口。

## Fixture 与验证性质

`hill-static-fixtures.json` 含 9 个小图样例：链与断连、阈值停止、菱形首路优先、邻接顺序、选区屏障与重复边、中心未选中、空选区、低于阈值的中心、指数 0。

所有样例使用明确注入的随机值和指数 0／1。期望值先按静态分支手工确定，再由新写的 Python binary32 模型独立核算；固定样例全部通过。它们不是原游戏或 DLL 运行得到的 golden，不包含原作地图或存档。`heightsInSelectedOrder` 只是按样例输入数组表示映射，不声称原 HashSet／Dictionary 的枚举顺序。

样例文件 SHA-256：`d60521537c150b9cba0be3ecbd77d38840a6ed4c8fd10714408f2b5d5380ed83`。可供 TS 实现直接读取、核对输出值、RNG 消耗次数、FIFO 处理顺序和发现轨迹。非整数指数的工程测试只能标为网页数学实现检查，不能与这些静态确定样例混称原生逐位一致。

## 仍未完成的体验验证

本次没有恢复原 Collider 生成、原地图完整邻接来源、Unity RNG 状态、滑块实际范围、连续拖动采样、原渲染材质或海洋效果。相同命令的原作数值与画面对照尚未执行。因此本项可以支持下一步纯数值切片，不能用来标记完整画图、原作观感、浏览器性能或真机验收完成。

补充复核：上一批 Plane Average 的 `0x43B0E5–0x43B0EF` 确为滑块向零转 Int32、32 位整数加法、符号校正后算术右移一位；不是先把旧高程转 float32 再平均。普通无溢出域等于 `trunc((h + trunc(s))/2)`；原 32 位加法可能回绕，网页拒绝溢出或精确模拟回绕都必须显式选择，不能使用无界 JS 加法冒充原极值行为。本补充仅复查已有汇编，没有扩大本轮原生读取范围。
