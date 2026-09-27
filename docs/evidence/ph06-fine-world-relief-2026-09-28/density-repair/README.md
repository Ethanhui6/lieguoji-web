# Fine-world 索引密度修复

本轮仅修改生产 `src/world/generation/detail-orography.ts` 的空间索引尺寸选择与 `detail-fine-world-relief.test.ts` 的独立回归。`detail-natural-relief.ts`、Object.freeze、主线入口、旧 oracle、存档与预算常量未改动。未执行构建、GPU 或浏览器。

原主线 first 统一测试为 130/136：六个 writer 用例的 beforeAll 被“山系局部密度超出有界查询预算”拒绝，不能称为六个断言已执行。随后独立复现使用完全相同的真实 writer 配方：矩形 `[1024,1664] × [1024,1536]`、size128、seed=`explicit-fine-new-land`、relief2200、shelf96、结构16、粗糙0。诊断模块只增强原抛错位置的信息，不放宽任何预算。

499 个实际支持节点、三条完整曲链。在原 `(20,20)` 的 64-world 桶构造到第 193 项时拒绝，来自主脊58项、支脊79项、另一支脊56项；这是粗索引桶汇集过多细支持。保存全部原支持后，只重新计算覆盖空间桶，结果如下：

| 索引桶边长 | 桶槽位总数 | 非空桶 | 最大候选 | 索引引用 |
| --- | ---: | ---: | ---: | ---: |
| 64 world | 4096 | 30 | 202 | 1892 |
| 32 world | 16384 | 92 | 151 | 4198 |
| 16 world | 65536 | 315 | 108 | 11629 |

选择最小必要变化 **32 world**，仅当捕获并验证后的链含 `crossSection: 'fine-world'` 时生效。其余模式保持 64 world。节点生成、实际横断面、曲线、峰值、支脉、节点遍历顺序、贡献累加顺序均不变。每次查询最多192项、最多262144条引用、4096节点等原预算全部保持。

**内存变化明确存在：** 细模式临时 bucket 槽由4096增至16384；当前实现最多创建16384个 number[] 桶和16384个 Uint16Array 桶视图（构造时并存）。相对旧4096上界各增加12288个对象及外层引用槽。索引载荷仍受262144项约束，最终 Uint16 载荷上限仍为524288字节；JS 数组、对象头和分配器开销与引擎有关，不声称整体堆内存不变或精确字节上界。旧/local 路径的桶数与索引行为没有改变。

新增第七个 fine-world 用例先在未修复 runtime 上运行，真实复现同一预算错误（`regression-before.json`）。用例保留原矩形尺寸、seed和高度参数，通过真调用生成三个范围，保存真实 helper 返回结果，然后独立遍历全部支持节点计算高程。它不调用生产桶查询或生产合成 helper；在32-world桶的边、角及相邻Q8坐标（1311点）与生产查询逐点对照，另检查世界边界、完整支脉及查询预算。实际海岸修饰与完整写入链由原 six writer 用例直接验证，未改它们的配方或断言。

修复后定向 **29/29 PASS**：7 fine-world +16 原 Orography +6 原 writer。`targeted-after.json` 是实际报告，`verification.json` 记录用例数、SHA 和未改变范围。类型、lint、完整统一构建及三端浏览器由主线接着执行；这里的定向结果不冒充那些结果。

原始证据：`density-before.json`、`density-before-supports.json`、`index-sizing.json`、diagnostic source/config、两次诊断报告、`regression-before.json`。`before-*` 是修改前源文件。旧 oracle 的 SOURCE_MANIFEST 仍记录首次六测试提升的来源 SHA，该历史来源未重写；当前七测试的 SHA 以本目录 `verification.json` 为准。
