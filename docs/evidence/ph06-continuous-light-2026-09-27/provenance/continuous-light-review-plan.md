# 连续细海岸显示光照：候选到达前的只读审查边界

2026-09-27。范围：当前 `detail-terrain-shader.ts`、节点页、权威海陆 clip 与现有显示后端的源码审查；未读写他人的候选，未修改 src，未运行任何检查/浏览器/基准。本文是待候选复核清单，不是实现或视觉验收结论。

## 1. 当前代码能确认的成因与最小改动面

当前 `detail-terrain-shader.ts` 的 `triangleHit()` 从命中的最终 Q8 裁切片求解析 gradient；`writeResult()` 把 `(gradient.x + gradient.y) / 40` 经 atan 转成固定 NW 方向的 0.87—1.13 光照，再取高度/光照 LUT。同一个三角形内 gradient 为常量，相邻片可跳变；这确有形成细网格明暗的代码机制。父任务提供的近岸像素尺度是 2 world × 11.25 px/world = 22.5 px；本报告未独立读取该截图，不新增截图归因证据。

四个角的高度/coverage 本来就是严格 `texelFetch` 的真实输入；packed RG/BA 分别是 signed16 coverage/height，改为 linear 会在字节层混合出错误数值，不能作为光照修复。`terrain-mesh.ts:38–40` 的最终海陆 LUT 已使用 linear，允许连续光照连续查色。

建议最小边界只改变显示 light/normal 的计算与插值，并更新显示版本标识/对应显示 oracle；实际命中、height、clip、land/sea、页面内容、持久地理和 picking 一律保持原合同。新的平滑显示光照并不再等于“命中片解析法向”，名称和测试说明不能继续把两者混称。

## 2. 候选的关键判定

| 关注点 | 必须检查的事实 | 不接受的捷径 |
|---|---|---|
| 共享节点 | 同一全局 fine node、同一海陆侧的显示量应由同一确定 stencil 得到，与当前 triangle/fan、mesh 原点、相机、LOD 无关 | 每个 cell 只用自己的四角算独立节点值；这种值看似插值但跨 cell 仍跳 |
| 共享海岸交点 | 交点须用全局规范源边及海陆侧确定，端点顺序反转、两邻格和两个 fan 访问均一致 | 从“当前命中片”的解析 gradient 插值到交点，或按本地片面积产生不同权重 |
| 连续性 | 对同侧相邻片，共享边两个端点的最终显示值一致，片内重心插值才保证边上 C0 连续；若插值 gradient 后再 atan，仍需共享 gradient 一致 | 仅插值每片原有的常量 light；噪声或降低全局对比掩盖网格 |
| 海陆隔离 | land/sea 可以分别有共享节点/交点的光照值；零高程岸点是合法边界条件，严格异侧高度不应直接平均进当前侧 relief | 海底山谷抬暗邻岸陆地、山峰改变海面光照；将两侧节点简单 lerp 共用同一 crossing light |
| 世界边缘 | node 坐标只在 0..2048。缺邻居需明确单边差分或有效距离；重复 clamp 节点时不能仍假装完整中央差分距离 | nodeAt 越界读、东/南边 wrap 到下一行、把 padding 当高度、边缘斜坡无故减半 |
| 退化/极窄片 | 无邻居/无同侧样本/零权重/零法向有确定有限 fallback；光照仍限 0.87..1.13 | NaN 传播进 LUT，靠最终 clamp 掩盖除零或无穷 |
| 零值岸线 | 检查 `zeroHit()` 命中时的单独路径。现有 `writeResult(true,0,vec2(0))` 强制 light=1；新连续方案不能在周围已非 1 时留下强制中性细线 | 只改有面积 triangleHit，遗留零值点/边的不连续显示 |

海陆隔离不要求海岸两侧颜色相同，两侧本就使用不同 LUT；要求的是同一侧连续，且跨侧影响规则明确。若 stencil 使用真实岸线作为零高程边界，应固定 crossing 的几何距离和归属，不能把随邻片变化的 stencil 结果当共享值。一个负节点与正节点之间的线段在源线性场中只有一次过零；更大 stencil 若跳过局部海峡/岛屿，则还需证明没有跨不连通同侧区域借光。

## 3. 不得变化的权威几何与数值路径

现有 CPU `detail-coast-geometry.ts:22–56` 与 GLSL `crossing/clipped/triangleHit/pieceHit` 必须继续一致：

- 固定 NW–SE 源三角形；交点先按 x/y 规范排序；Q8 半向上取整；严格异号偏移 clamp 至 1..511；height/coverage 均为零。
- 删除相邻重复点的次序、polygon fan 顺序、面积 >0 判断不因新增光照属性变化。
- 完整 land pass → zero-edge pass → 完整 sea pass；全零源三角完全属于 land，不发 sea。
- 零面积 land 点/边仍按原 picking 合同归陆。世界东/南边界仍落最后一个真实 fine cell。
- `uDetailDiagnostic==1` 的 RGB24 land+height 字节合同和 alpha=255 不变；原正确 geometry/height GPU parity 应保留。它没有输出光照，**单独通过它不能证明新 light 正确**。
- gradient/light 计算不回写高度，不平滑 coverage，不增加另一条显示海岸，不改保存恢复或格式指纹；显示 kernel 的版本身份与运行时代码来源仍需真实更新。

光照用局部 Q8 坐标时，跨 mesh 原点必须相消；节点取样身份则必须用全局 node。不能把 `FineVertex.q` 的 0..512 本地坐标误当世界节点地址。中央差分两邻居相隔 4 world，单边相隔 2 world；量纲应与所选显示合同明确一致，不能借变小分母制造过度对比。

## 4. 跨块、跨页与资源预算

`detail-terrain-pages.ts` 当前按全局 nodeIndex=`y*2049+x` 编码，并非 64×64 owner tile 图集。`sampleDetailCoastNode()` 已解决唯一 owner、omitted sea 和 uniform land 的值，shader 只能消费完整页，不能重新根据“本 tile 有无内容”另造边界。

有三种不同边界需要分别覆盖：

1. 真实 owner tile 边界（每 32 fine cells），以及 sampled↔omitted / sampled↔uniform；不能出现第二套共享节点值。
2. 节点页 1024 texel 行和 1,048,576 node 页界。页起点实际是 `(1537,511)`、`(1025,1023)`、`(513,1535)`、`(1,2047)`；世界 x+1 邻居不是 texel x+1，不能用固定 RGBA 图像邻域替代 node 地址重算。
3. 显示 RT core/gutter、mesh 原点和 LOD/cache 边界。同一世界点从不同 core 重画或改变相机小数平移后，光照不能因生成本地坐标而变化。

资源现状：2049²=4,198,401 个节点，每节点 4 字节；5 个页面实际分配 4,199,424 pixels / 16,797,696 bytes，包含最后页 padding。另有两个 1201×33 LUT，当前 shader 一共 7 个 sampler，capability guard 只承诺至少 7 个。只在已有 pages 中增加 fetch，不增加存储页，可以维持这部分账本；但**显存不增不等于 GPU 成本不增**。

- 当前每个 fragment 取四个真实角节点，命中后通常取一次 LUT。候选应列出平坦内部、一般海岸、最坏裁切片的实际额外 `nodeAt/fetchPage` 调用上界，不能只报“用了四邻居”。
- 四个角各读四个轴向邻居，朴素实现是现有 4 + 16 = 20 次节点 fetch；其中合计仅 12 个不同 node，存在重复取样。若只为实际命中片算光照或显式复用角点，可降低调用；具体以候选源码计数，不能先声称硬件会缓存掉。
- stencil 不应在每个未命中的 clip/fan 分支重算；特别是先尝试 land、再尝试 sea。避免以支持几个顶点为名引入每像素遍历大量邻片/循环 clip。
- 新增法线/光照全图纹理、全图 CPU 辅助数组或缓存时，必须计入 sourcePixels、CPU bytes、shader sampler 能力与清理流程，不能复用 RGBA 的 alpha（它是高度高字节）。再加一套 5 页 field 会把 sampler 要求从 7 变为 12，已超过当前能力合同；不再是仅 shader 的最小方案。
- 维持 `DetailTerrainBackend.prepare/installGpu/releaseGpu/destroy` 的完整页面发布、取消和 context loss 生命周期；若只改 shader，无理由修改这些所有权机制。

## 5. 候选到达后的有界复核/后续验证建议

收到根通知后，先绑定 ready-manifest 的生产基线与候选 SHA，仅读精确 diff 和候选 oracle/测试，不扩展到地形生成修改。静态复核顺序：geometry/diagnostic 不变 → shared node/edge+side 身份 → 世界与页界 → 最坏 fetch/循环 → 版本与资源账本。

后续执行需等根授权的检查窗口；本轮不运行。建议保留原 land/height GPU parity，并加最少几组直指机制的光照证据：

- 同侧非平面高程跨四格、两种源三角和相邻 fan，比较共享边两侧趋近值；常高程应中性，恒定斜坡的边缘单边规则要可解释。
- 对置海陆陡坡、1-Q8/511-Q8 crossing、全零三角、孤立零点/零边；改对岸高度不改变当前侧约定的光照（若设计刻意允许影响，须明确范围与原因）。
- world 四边/四角、上述 4 个页界、owner tile 边、缺省/实值切换；无非法 fetch、NaN 或透明洞。
- 同一持久真实近岸场景、同一相机/尺寸/DPR 的前后实际截图与光照采样；额外采样成本用实际冷/暖绘制记录，不以 CPU oracle 或只看 diagnostic 宣称视觉/性能通过。选择平坦图不能替代原有近岸 22px 问题场景。

方案作者在本轮阅读后发来的接口说明是：4 个角点加 8 个外部轴向邻点，共 12 个 unique fetch；源节点各侧用同侧高度或规范 crossing 的零高程/实际距离；crossing 每侧继承原边该侧端点光照；最终 piece 内重心插值。这一**文字方案**在固定地理下有同侧 C0 连续的合理依据：相邻片只要确实复用同一节点、规范边及 side，共享边端点光照相同。它不要求海陆两侧相同，也不保证 C1 或截图质量。已回传重点：zeroHit 不得遗留中性光照、单边差必须使用实际距离、12 unique 节点必须核对实际 fetch 调用及分支重复。尚未读取候选源码，待根通知精确复核。

当前基线 SHA-256：shader `ee95bb492ef441a9e52d6f2ec6660deea226c01c61b84df3340c88d5191c0f05`；pages `a402ab959cdfcb3ee0a047d0bfe7201d1944bff8c2f1b817a0a40da6fc478764`；geometry `96f48a325f6e732795562aa7efa629dc22fe027b1d1f1e4e49cde8862b7f7e04`。本清单未对尚未收到的候选给出通过/失败结论。
