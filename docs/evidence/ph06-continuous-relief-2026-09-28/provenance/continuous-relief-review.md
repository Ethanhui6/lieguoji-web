# 连续曲脊与旧陆地背景联合静态审查

2026-09-28 香港；审查 `.autopilot/ph06/v4-curved-relief-staging` 与 `v4-local-background-staging` 的已冻结 ready-manifest 和全部 8 个候选源/测试文件。8 项实际 SHA-256 均与 ready 相符。未运行测试、生成器、数值脚本、浏览器或构建，未改生产或候选文件。本报告不能作为通过测试、性能、自然视觉或 PH 验收。

结论：**未发现确定的范围写入、锁、海岸覆盖、旧 Hbase 或索引漏候选阻断。发现一个确定的横向坡度不连续点，应修复后再声称连续坡度；它不破坏高度的 C0 连续或数据安全，但可能留下新的折痕。** 当前默认同意 root 进入组合验证，前提是保留完整旧生成身份、现有独立末审和真实浏览器结果；不能仅凭此静态审查接受外观。

## 需要修的具体问题

曲脊候选 `detail-curved-ridge.ts:61`：

```ts
const width = node.widthQ * (1 + .15 * node.leeQ * Math.max(-1, Math.min(1, across / (node.widthQ / 4))));
```

迎风/背风宽度使用线性 clamp。在 `across = ±widthQ/4`，width 的导数从 `±0.6` 对应符号的内部常数突然变为 0。这一位置仍在紧支撑核内部，`radius2 < 1`，故 `(1-radius2)^3` 的边缘三次归零不能消掉此导数跳变。高度连续，但贡献场横向一阶导数不连续。

以 `leeQ=1`、沿脊坐标 0、W 为 widthQ 为例，正侧接点 y=W/4 处，实际宽度 w=1.15W。r=y/w 的导数在内侧为 `1/(1.15² W)`，外侧为 `1/(1.15 W)`；两者不相等，而且高度对 r 的导数非零。无需运行就能确定该接点不是 C1。叠加多点可减轻肉眼影响，但不能保证抵消。

建议窄修：side 饱和函数保持奇对称、范围 [-1,1]，在达到 ±1 处使导数为 0；继续保留最大宽度 1.15W，以免索引外包围失效。新增针对真实采样横坡接点两侧的斜率检查，不只检查高度差或复写同一公式的 oracle。若暂不修，说明只能承诺高度连续，C1/C2 整体山坡和无折痕外观仍待处理。已向 root 与曲脊作者报告，未擅自改变冻结文件。

## 背景采样边界与分位数

- 栅格间隔为 8 个 fine node，即 16 world；窗口半径 16 个 fine node，完整窗口为 33×33 节点。源高度范围 0..12000，可安全放入 Int16Array；-1 是无陆地哨兵，不与 0m 有效陆地冲突。
- 左/top anchor 使用 `floor(bound/8)-1`，右/bottom 使用 `ceil(bound/8)+1`。对于非整格查询，B-spline 的 floor-1..floor+2 四锚点都存在；若查询正好在最右整格点，第四个权重为 0，所以多一格 halo 足够。世界边界才重复端点，非世界局部边界没有缺失有效支撑。
- source rectangle 再在 anchor rectangle 外扩 16 nodes。各统计窗口与后续滑动条带均包含在已读缓存中；右/下用 inclusive bounds，与 `mask.left+mask.width` 最后一条合法节点线对应。
- 每行重置 histogram，第一次建立当前窗口；后续只移出 `[lowX,nextLow)` 并移入 `(highX,nextHigh]`。世界边缘低端停留或高端裁剪时仍对应实际窗口，没有重复添加边缘节点。
- nearest-rank 下四分位 rank=`ceil(totalLand/4)`，先减每个 group 计数，再减 bin 计数，选择条件 `rank<=count` 正确。仅 coverage>0 节点参与，不把海面或零覆盖节点作为低地。
- cubic 权重非负并分区求和。实际正陆地节点处，所有具有非零权重的支撑窗口都包含该节点，因此不会出现海窗口洞导致随意补零；代码只在空窗口诊断查询返回 undefined，真实写入节点缺背景会拒绝整个候选。
- helper 的覆盖区域来自实际 mask envelope，不直接扩大写权限。只读支持可以跨选区和保护区，原源已由 local kernel 私有捕获，批次中读取稳定。
- 每次读、增减窗口、rank访问都有有界工作计数和取消检查。每行 `bins.fill(0)` 固定 12001 项；这不是性能验收。返回 sample closure 不需要再访问源数据。实现没有每个输出节点重扫旧世界。

尚需实际验证世界边界、分散小岛、贴岸低地和多数高度锁的组合。宽于 64 world 的旧高原仍作为背景保留是当前明确算法范围；不能把它称为侵蚀、完整旧山脉逆分解或自然地质模拟。

## 曲线、支持索引与局部尺度

- Natural planner 在既有真实合格陆地粗格上选择锚点；按长轴严格递增过滤最近点，避免因 snap 折回。共享 Hermite 切线同时受长度与长轴间距约束，连接点切向共用。
- 每段曲线的步数来自 Bezier 控制边导数上界，预量化最大步长 1 world；实曲线而非原弦接受 isLand 探测。拒绝一段会终止该 run，下一段重新起 run，端点淡出只施加到真实 run 末端。
- 该探测是离散检查，不证明连续曲线上任意小的海/锁缝都不存在。已有最终写权限与真实片保护审计仍必须保留。支持核也可以横向覆盖曲线之外；靠 profile 的 land 参数及 kernel 的允许节点/海床审计阻止越权写入，不能只用中心线检测替代这些保护。
- run 点间累计使用正的量化弧长；重复 Q8 点先移除。支持数按最窄宽度取样，宽度还可按邻近实际弧距缩小。support index 用最大 1.15W 的旋转轴向矩形包住紧支撑椭圆；bucket 查询在世界右/下边界 clamp 到最后 bucket，与创建索引的 clip 相容。
- 每 bucket<=192、总 supports<=4096、总 references<=262144，Uint16 support id 容量足够。超预算明确拒绝，没有静默裁去节点或遗漏贡献。临时 run gate scratch 在每次查询 stamp 切换且溢出归零，可避免跨查询残留。
- 局部模式通常一组曲脊；宽度由真实可用长短跨度与相邻锚距限制，不再强制世界模式的四个粗格宽。仍保留 kernel 的三锚点和最小真实跨度检查，极窄或碎裂选区会拒绝，不会凭空补山。
- 窄局部 run 的 peak 波长下界 128 world 可能只有一两个起伏周期；这属于待视觉验证的局部外观，不是数据错误。端点切平面 gate 会对强弯曲 run 的某些偏侧支持额外削减，当前单调长轴降低自折风险，但有形态/宽度偏差的可能，需要实际轮廓检查。

## 原保护合同和组合接口

对生产 `detail-local-relief.ts` 做只读 diff，候选只改：新增背景 import、传 `scaleMode:'local'`、在写入前建立背景、给 physicalHeight 第六参传旧背景、调整解释注释。实际保护、选择、transition、海岸距离、capture、末审没有删除或改写。

- 背景查询只用于目标高度；coarse centers/heights/quads 仍私有读取，Hbase 未改。
- 原共享节点规则依然要求所有 incident fine cell 可编辑；选区外 quad 和高程锁先从 eligible mask 扣除。
- 覆盖值、海岸零点、负覆盖海床节点不改；tile 首次 materialize 保留原所有节点再改允许高度。
- source-node 末审、真实 coast/sea triangle 末审、锁保护以及原面积测量仍执行。带海片的混合单元不能仅凭节点正覆盖跳过海床守恒检查。
- 六参接口与曲脊候选一致：第六参是有限 0..12000 浮点米值，在陆地替代 lowland/rolling，只加新脊并沿用海岸 taper；五参世界入口和 sea 分支保持调用形式。最后四舍五入回真实整数高度，不写装饰值。

## 测试与证据边界

新增 background 6 测试含独立排序四分位、非海节点、边界、连续插值、取消和源不变；曲脊 9 测试含完整穷举 supports 的独立索引 oracle、实际曲线海域拒绝、端点、私有捕获、批次确定性及局部尺度。它们均未在本审查运行。

现有自然山脉测试换成真实 arc/normal 的测量坐标是相应生产模型变化，原数值阈值仍留存；峰值判定从相邻规划锚点改为实际 summit 两侧最低 saddle，因此不是完全同一统计量，应在新数值证据说明测量语义。其他四项验收没有变。本次审查不把修改测试等同于得到正确地形。

应在组合后保留原局部保护/保存/撤销测试并执行实际浏览器，检查真实曲线和局部背景能同时生成，确认不可变源与旧存档回读，然后看实际粗细地形截面/图片。新曲脊不应覆盖 preview13 移动超时记录；显示复用优化与自然视觉结果仍分别报证据。

## 被审候选身份

| 候选文件 | SHA-256 |
| --- | --- |
| detail-natural-relief.ts | 6542372a94a18f937736bf31950737f9d590fd36644faaa25a6eeb7a834cc055 |
| detail-curved-ridge.ts | b3c0054e85be742d87803f12b166b19023296360193628a43a41bd8f9669d6d6 |
| detail-curved-ridge.test.ts | d130d5b8eaaa9399fb4a0143c8e6e7645e2a7b3e548b57a050107b0029b3faac |
| detail-natural-visual-repair.test.ts | 20925e333cb3d6248d7e664f8ee96231d68186d789fde178ba2bd1545c8be48d |
| detail-local-relief.ts | 57da7cc4417c440436c41de84a4d370fe24e2f06eed0614f42fe1ab07f2b9050 |
| detail-local-relief.test.ts | d7601626bf0191b697af716ca8a7bbad07fb6d74a96551363395c555a0d043d5 |
| detail-local-background.ts | 569e8b233b8bd633b33ac5ae0b1f840ea0a01d759ff0d45616a575008a593026 |
| detail-local-background.test.ts | 5fdf7a06e78d7989f6f36ad59a4c211a9740923c192c6c640b0406d521f9e899 |

后续修改以上文件会使本次冻结身份过期；具体确定问题可在对应修复后追加复审，不能继续宣称此表覆盖新字节。
