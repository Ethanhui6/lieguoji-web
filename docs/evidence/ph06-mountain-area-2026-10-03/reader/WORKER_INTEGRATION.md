# Reader 的下一步真实流向接入

状态：已把通过候选检查的 `hydrology-reader-owned.ts` 与测试接入 `src/world`，仅改 11/10 行 import 路径前缀；来源/目标哈希见 promotion.json。尚未运行提升后检查。本提案未修改 Worker、bridge、协议、UI 或 renderer。

## 当前实际数据流

1. `src/editor/hydrology-controls.ts:hydrologyRectangle` 始终围绕点选细节点生成世界内 512×512 矩形；`AtlasStudio.tsx:analyzeHydrology` 调用 client，返回后再核对当前世界身份。
2. `src/world/bridge.ts:analyzeHydrology` 拒绝只读/非 v4/待确认预览，复制 verifiedHead 四字段，发既有 `hydrology-analyze` 请求。
3. `src/world/atlas.worker.ts:292` 验证请求，捕获真实 Owned session，检查 session/root/head，然后调用旧 `extractOwnedHydrologySnapshot` 一次；完整 512² 输入交 `buildHydrologyKernel`，再用 `buildHydrologyTrace` 投影最长 4096 点路径。
4. bridge 验证 trace 的原矩形、相邻路径、来源/锁摘要，再供 renderer 绘制。原合同仍会明确报告 crop 未解析、partial、truncated；不等于已生成永久河网。当前两页 receiver 的双 128 核心没有接入这里。

## 建议下一批：原 512² 分页抽取，完整域统一计算

在既有 Worker `hydrology-analyze` 分支内使用新 reader，保留当前请求/响应/选点/UI 全部合同。请求矩形先严格通过旧 validator；内部确定性分成最多 4 个互不重叠的采样矩形。某一边长超过 256 时平分为 `ceil(length/2)` 与 `floor(length/2)`，否则不分；这样 257 不会产生非法的 1 节点尾页，正常 512² 是 4×256²。

创建**一个** reader：owner 的 assertCurrent 同时核对 `this.active === active`、真实 session 对象、durable rootDigest、expected 四字段及 signal；预算用实际分片数与原矩形 `columns*rows`，不要直接给它 64 页最大额度。顺序 readPage 并按真实行列偏移复制两份 Int16Array 到原矩形的一份完整 kernelInput，明确检查每页来源、边界矩形及总覆盖无重叠/缺口。

然后仍然只运行**一次原来的完整域 kernel** 和原来的 trace。采样页接缝不成为水文边界：kernel 可以在整个原 512² 内跨提取接缝解决平坦区、汇流和真实下游，不能先独立算 4 个小 kernel 再拼路径。跨页提取也没有 halo 需求，因为原 kernel 需要的原矩形节点全部已经填齐。

整个操作用 try/finally 关闭 reader；任何 accepted read 取消/失效都不能发布部分 trace。kernel 与最终 post 仍执行现有 check/yield 检查，不能因关闭 reader 就省略来源验证。成功、失败、取消后不把 reader 挂到 Worker 全局或跨请求缓存。

这一步让真正的现有流向操作使用同一私有读取器连续读取多页，同时保持旧 512² 范围与原算法结果。它本身不扩大用户可见分析范围，不能称为全图河网或把尚未解析的下游说成已接通。若主线先采用单页 `readPage(originalRectangle)` 接线也可保留行为，但只有多页抽取版本才实际覆盖本次复用需求。

## 预算、取消和来源边界

- 页面采样累计最多仍是该请求的 262,144 节点，重叠重复必须计入预算。本次分片不重叠；也不改变全局 reader 的硬上限 64 页/4,194,304 采样。
- 最大完整 kernelInput 两数组 1,048,576 bytes，单个顺序分片临时页最多 262,144 bytes；及时解除旧页引用，不缓存四页，也不声称立即 GC 回收旧页。原 kernel 12,582,912 typed-byte 上限原样保留，输入/临时页/完整地理副本/JS heap 必须分别报告，不能相加后冒称可靠 total heap。
- reader 一次 snapshot/锁摘要/Hbase 只保证这次操作绑定相同来源；不让返回的 metadata 成为可重启读取的凭证。读完后真实 session/root 改变，最终结果仍应拒绝。
- 沿用 Worker 的真实 task yield 和取消消息，不用微任务循环占住取消事件。跨页前后、kernel yield 前后、发送完成前都检查当前 active/owner/head。

## 最少必要验证与后续缺口

后续接线的一批统一检查应包含新 reader、`hydrology-worker.test.ts`、`hydrology-trace.test.ts`、现有桥接检查，新增少量断言即可：①实际 512² 结果与原整页抽取一致，路径/平坦区确实跨越 256 的采样页缝，snapshot/Hbase 各至多一次；②第二页中取消、换 owner 或变更来源后无 complete/持久写入，重新发请求可独立成功。正式浏览器复用 `tests/atlas-hydrology.spec.ts` 的原生选点、活动计算取消及刷新恢复；本提案没有运行这些检查。

未来要真正沿未解析下游读取原 512 范围之外的地形，可以在同一次 reader 生命周期继续申请有预算的页面；但它需要跨页真实 receiver/平坦区解析和贡献样本去重，不能把两个 crop trace 或双 128 结果直接串起来。旧 HydrologyTrace 要求全部点在请求矩形内，算法为 fine-drainage-v1，贡献上限为该域 n；超出此合同需要单独可验证的新结果协议，不能强转或放宽旧 validator。这个后续缺口不在本批扩展为全图协调器，也不增加双页调试面板。
