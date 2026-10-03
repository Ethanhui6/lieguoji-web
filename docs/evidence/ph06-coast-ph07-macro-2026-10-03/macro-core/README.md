# 全大陆宏观汇流候选

仅本地隔离准备；未运行类型、lint 或测试，未修改生产、Worker、UI、计划或文档。CPU 窗口由主线程安排。

## 数据与 API

- `hydrology-reader-owned.ts` 是生产读取器副本，保留 `readPage(rectangle)` 全部原语义，新增 `readMacroGrid()`。一个 private snapshot、manifest 与 lock 摘要、owner/head lease 复用；每个宏观请求实际预付 1 页、66049 样本。世界 `[0,4096]²`，257×257，间隔 16 world；直接从 `sampleDetailCoastNode(field, column*8, row*8)` 读取真实所有者节点。Hbase 仅在需要时构建一次。宏观与旧页面互斥串行，关闭/接受操作中的失败使整个读取器失效。
- `hydrology-macro-contract.ts` 定义独立宏观合同，不强转旧 2-world HydrologySnapshot 或 trace。`validateMacroRequest`、`validateMacroPreview`、`macroPacketBytes` 可用于 Worker/bridge。
- `buildMacroFlowPreview(grid, request, control?, options?)` 使用既有 `HydrologyControl` / `HydrologyOptions` 参数形状。request 为 expected + maxBranches(1–64) + maxEdges(1–8192) + minimumContributingSamples(1–66049)。建议 UI 默认 64 / 8192 / 16。
- 返回 nodes 的 ids/coverageQ/groundMeters/contributingSamples 对齐普通 number[]；edges.from/to 也是全局宏观 nodeID。`x=(id%257)*16; y=floor(id/257)*16`。branches 给出 sourceNode/endNode/stop，可沿去重 edges 查看其下游。输出正文经普通 JSON 实测限制在 508 KiB，为 512 KiB Atlas 包的外层预留 4 KiB；Worker 仍需检查实际完整编码包。

## 规则与边界

只沿四邻实际采样节点下降；同高平台确定性地连接已知低处/采样海域。无出口的平台保留低洼，触及世界边缘的无出口平台终止于实际边缘节点并标记 unresolved。不挖山、不填低洼、不造湖水。采样 sea 不证明外洋；首版 coast 仅是 16-world 海陆过渡边，无精细岸口坐标。16-world 边可能经过未采样微地形，合同与 UI 必须保留此限制。

汇流数是上游已代表的陆地样本数，不是水量。显示分支选取达到阈值且其上游尚未达到阈值的节点，优先所属终点的总汇水样本数，再按来源样本数和稳定 nodeID 排序。复用不再使用的 queue 存储 terminal index，不增加 typed 数组预算。共享下游只绘制一次。分支/边预算截断保持连续，不跳接终点；`displayTruncated` 如实记录。

内部整数数组实际为 21×66049 字节，另有输入私有副本、来源地图、JS 集合、JSON 等内存；不是进程峰值内存声明。操作预算上限 96×66049，拒绝超出工作。回调前复制输入两数组与身份，调用方后续变更不会改写正在计算的地理。拥有者状态变化由 reader 和 Worker guard 在 yield 前后检查。

## 检查范围

候选共 13 项：原读取器 4 项、宏观读取器 3 项、内核/合同 6 项。包含真实 explicit/uniform/implicit 读取、单次 snapshot/Hbase、身份与关闭失效、预算与互斥、确定性汇合、低洼、边缘、取消、输入变更隔离、协议拒绝和最大 8192-edge JSON 包。

主线程授权 CPU 后统一执行 `node .autopilot/ph07/macro-flow-staging/check.mjs first`。该 runner 保留各命令原始输出、原始 test JSON、检查前后源码哈希和本轮候选副本，不覆盖旧轮次。

生产应用时将候选的 `../../../../../src/world/` 导入前缀换回 `./`。旧读取器测试仅需要把公开键列表的预期新增 `readMacroGrid`，旧 readPage 行为断言不删。

自然河网、永久河流、湖泊水位、流量、真机和整个 PH07 均未因此验收。
