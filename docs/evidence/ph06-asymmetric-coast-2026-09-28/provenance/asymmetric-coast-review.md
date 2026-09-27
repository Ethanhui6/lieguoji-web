# 非均匀海岸候选窄静态审查

日期：2026-09-28。对象：`.autopilot/ph06/v4-asymmetric-coast-staging/`，以自然形状和原有真实地理保护合同为范围。未执行候选、测试、构建、数值生成或浏览器；只新增本报告，不修改生产或冻结候选。

结论：本次静态审查未发现需要阻止进入统一检查的具体代码错误。非重叠、单一幅度上限、循环索引、私有输入与取消的推导成立；新测试确实包含实际生成地理的读取。但这不构成测试通过、通用拓扑证明或自然观感通过。必须保留原输入、同 seed/参数的真实目标海岸与产品截图验收。

## 审查快照

ready-manifest SHA-256：`408f1fd6955fedd27e1c8a6b2179a3c6d098a86b36e6b23ef512162ef723d7ba`。

| 候选文件 | 实际 SHA-256 |
| --- | --- |
| `detail-natural-outline.ts` | `fa1cd343809c2074e6c6166c07b4ed27ea7d5ebfe7d890cebf36974867404fb6` |
| `detail-shape-natural.ts` | `b97fd13d7c6d463c29dbaa0539fd711657315907550834b151dbdc4a96885dde` |
| `detail-natural-coast-plan.test.ts` | `82765fdc207c60869c81bf2a0e4728ce43138447bece559937f816a6297bae82` |
| `detail-shape-natural.test.ts` | `0b95185a4b7470f4d851ef6d2df3d0cf763d0aa2eee0e6d41f1a46716aebbccc` |

上述四项与 ready-manifest 匹配。只读 diff 确认：outline 增加新 planner，原几何函数未改，旧 numerical oracle 仅改说明；实际 kernel 为 import、单次 await 构建、采样替换三处薄接线。原测试没有删除或放宽，增加两项真实 target 检查，海峡测试新增路径与两侧陆地断言。新测试文件有八项 authored case。

## 形状、非重叠与幅度

`detail-natural-outline.ts:228–261` 的每层 slots 来自累积正权重在完整周长上的分割；相邻边界使用相同累积值计算，最后边界回到 perimeter。打乱的是槽位权重和方向，不是按固定间隔交替正负。每层另有独立 phase。

- Regional 的 `fill` 范围为 650..890/1000，`shoulder` 为 30..110/1000；二者最大和为 1。`floor(slot*fill/1000)+floor(slot*shoulder/1000) <= slot`，所以事件末端不越过自己的槽位。
- Local 的最大和为 .820+.110=.930，同样不越槽。取模只把完整分割旋转到环上，不会制造同层重叠。量化边界可能相接，但端点权重为零。
- 保留下来的 length 至少 16 world，peak 在长度的约 28%..72%，两侧分母都严格为正。小于该宽度的事件被抑制，未人为放大。
- `ease` 使用 `s=t²(3−2t)` 以及 `s+k*s*(1−s)`。`|k| <= 1228/4096 < .3`，对 s 的导数 `1+k*(1−2s)>0`，因此合法事件内权重保持 [0,1]。
- 同层不重叠使归一化 regional `|r|<=1`，local `|l|<=1311/4096<.321`。组合 `r+l*(1−r²)` 关于 r 的导数是 `1−2lr>0`；区间端点为 −1 和 1，因此无需 clip 就保留原幅度界。它不会把两套独立最大幅度相加成更大的位移预算。
- 在一个幅度未因物理宽度而衰减的主峰上，regional 最低约 .85；最强反向 local 后仍约 .76。这确实避免旧固定 2:3 谐波组合大幅相消。但短周长的 reach 有意更小，不能把 .76 说成所有地图的最低实际湾深。

结构层从固定等距波改为不等宽事件、偏心峰及左右不同肩形，在代码上直接改变真实 SDF 设计场；不是只改 renderer、颜色或边线。幅度仍受原结构+细噪总预算约束，默认 96+16 无法产生 500-world 半岛；这一合同没有偷偷放宽。

## 环接缝、bins 与工作上限

- 263–291 行以原始 start 至 start+length 的连续 bin 区间登记，再对 bin 取模。因为每个事件长度小于周长，它不会绕圈登记自身两次。查询也先归一化到同一圆周，随后用圆周 distance 判定是否实际落在事件内；跨零点事件有正确候选。
- 注册使用端点所在 bin，查询再检查距离，宁可含零值端点候选，不会漏掉事件内部。边界浮点计算只用于索引和连续权重，最后 kernel 的 `roundRatio` 仍把设计覆盖写成 Q8 整数数据。
- 事件起点、终点的 ease 导数为零；peak 两侧权重都是 1、两侧导数均为零。圆周相位与同一私有事件表保证数学上的 C1 拼接；没有声称 C2。
- 数量实际为最多 10 个 regional 加 36 个 local，低于 48 上限；索引固定 128 bins，1024 references、每次查询 8 candidates 仍显式拒绝超限，没有截断候选或降分辨率。返回 features 是副本，内部查询不会读外部修改后的数组。
- Planner 测试的 exhaustive oracle 枚举全部事件而不读 bins，在 128 个边界的左右和正点共 384 个位置比较；另有圆周等价及端点/峰值有限差分检查。这些是合理的 authored 检查，尚未执行，且仅一个主要 fixture 不能替代所有 legal source 的证明。

## 取消、私有输入和原地理保护

Planner 在第一次 await 前复制 seed/perimeter/structure 三个标量；只有私有 features/index 被 sample 闭包保留。首次 checkpoint、两层之间、索引按 batch 和末尾均检查 abort；本批没有新的无界循环或每个细节点重建计划。返回的 features 再逐对象复制，修改诊断信息不会修改生成函数。

实际 kernel 仍在首次 yield 前通过原 ownBuffer/ownRecipe 把缓冲区和点复制，拒绝共享/异常缓冲及访问器等输入。新 planner 接收该已私有化轮廓的 seed 和 perimeter；新 await 没有把用户可变对象重新放回生成过程。取消只抛出候选流程，不写原 base/recipe/detailCoast。

`detail-shape-natural.ts:102–138` 的原输入自交/自接触检查、采样整理、面积下限、非相邻 facing feature cap 与 cap 传播未变；`roundAndIndexNaturalOutline` 原角部圆顺、已用位移扣除、方向和交叉检查未变。实际 SDF caller 仍插值剩余 cap，然后在同一 structure+roughness 预算内组合新结构层和原 48/12-world 细噪。

之后的真实 2-world 三角覆盖提取、target distance 重算、Hbase 拼接、保存数据和面积审核管线没有改变。不存在新画一条装饰海岸却让拾取/保存继续读旧几何的第二套权威层。

## tiny、12-world 海峡与陆桥

- 新 tiny 实例是真的 `generateDetailShapeNatural`，输入为 16×16 world 小岛、structure=96、roughness=0，查询实际 detailCoast 的中心陆地、四侧邻海和面积守恒。轮廓周长低于 96 world 时不强塞结构事件；原微小 round/cap 仍存在，所以“结构事件为零”不等于承诺所有参数下源轮廓字节不变。
- structure=0 时 planner 返回空 feature/零 sample；结构与 roughness 同为零的原 literal contour 路径未改。tiny 测试只保证其具体细岛存活，不能推导所有极小地形形状均通过。
- 原 12-world U 形入海口仍由 facing 平行岸线的四分之一距离约束保护。新 fixture 增加 x=1274、y=1190..1244、步长2的真实海水路径，及两侧 x=1260/1288 的陆地点；不再只有单个中心海点。它要求海峡保持通行和岸侧地貌存在，不要求生成后宽度精确仍是 12 world。
- 原 12-world land neck fixture 未改，仍逐2 world 检查 x=1264..1356、y=1186 的实际陆路连续样本，并检查两侧海水。新结构 sample 保持同一幅度界，未突破 quarter cap。
- 这些保护依赖原 actual coverage 管线和实际测试结果；静态 bounds 不等于已执行的全连续连通性验收。不得遇到失败后放宽中心路径、海岸界或截止时间。

## 新 target 检查是否真正测产品数据

答案是肯定的，范围也需如实说明。

`detail-shape-natural.test.ts:62–79` 直接读取实际 generator 输出的 `world.targetCoast`，拒绝零长/重复段，要求每个目标顶点 degree=2，且无岛 fixture 只有一个闭合 component。它没有把原输入 polygon 自交校验冒充生成结果闭合校验。但只是一个矩形无岛 fixture 的真实结果检查，不是任意地形的通用拓扑证明。

81–104 行的宽差测量同样遍历实际 Q8 target 端点，去重后独立计算到用户原轮廓各段的投影、欧氏距离和 inside/outside 符号，再按原物理弧长约16 world 分桶、合并循环正负 run，测量实际 shore 偏移范围。没有读取 planner.features 宽度来自己证明自己。

该断言的准确含义是：至少有一段实际向内湾和一段向外岬，且保留下来的至少两个实测宽度相差32 world。它不保证每一类各有两个不同宽度的特征，不测深宽比、全图视感或玩家画图感觉。分桶平均还会损失小范围细节，因此不能把这项通过改写成“大陆自然感已达标”。原矩形 fixture 与用户关注的八点大陆不同；后者必须用既有 exporter 的同 seed/同参数实际前后图继续比较。

## 仍需主执行者完成的证据

统一检查必须实际覆盖原保护/取消/私有化/恢复/Hbase 检查以及新增8+2项，保留实际失败，不以本报告代替运行。自然效果需要已有八点输入的同参数数值与真实产品视图，并逐项记录海湾宽深差、半岛偏心、大小尺度共存、安静岸段及输入意图是否保留。代码结构合理、闭环检查和宽差检查均不能代替用户的自然视觉验收。

本报告未发现要发给作者的具体 bug；已向作者和主执行者同步上述幅度/非重叠推导和宽差测试的证据范围限制。旧生成器历史冻结、闭包身份与提升顺序仍由主执行者负责，本审查没有修改或放宽它们。
