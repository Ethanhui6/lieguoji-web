# PH07 私有一次操作地理读取器候选

状态：候选已获根授权执行最小 CPU 检查。first 的 types 和 4/4 unit 通过，sourceStable=true；唯一失败是测试变量 reader 的 prefer-const lint。首轮原件保留在 checks/first。仅把测试声明改为带原类型的 const 后准备 repair-1；不改 runtime、断言或预算。repair-1 结果以实际 verification.json 为准。未运行 build、GPU 或浏览器，未提升生产。所有写入限定本目录。旧 `extractOwnedHydrologySnapshot`、双页 receiver、单域流向工具、Worker/bridge/UI 保持原状。

## API 与权限

`createOwnedHydrologyReader(owner, { expected, budget }, control?)` 返回冻结的 `{ readPage(rectangle), close() }`。`owner` 是内部可信的 `{ session: OwnedAtlasSession, assertCurrent }`，不是公开原始地理输入。expected 固定为 draftId/revision/manifestDigest/rootDigest，预算固定为 maxPages/maxSampledNodes；owner、expected、预算、signal、回调和调度函数都在首个 await 之前捕获。

创建阶段最多一次 `session.snapshotAsync`，该实际 API 会复制并核验全部粗地理、锁、细场哈希。读取器再核对完整 manifest 摘要，计算一次 lockSetDigest 并统计一次真实锁。atlasId 与锁元数据只取私有已验证快照；不使用 `session.metadata` 或任何已返回 metadata 对象作为授权。耐久根认证仍由可信 owner 的 storage/bridge 入口承担，读取器只绑定当时 Owned session head。

每页只接受一个严格的真实节点矩形，先分类 unique owner，再通过生产 `sampleDetailCoastNode` 抽取两份新 Int16Array（coverageQ/groundMeters）。显式细场绝不降级到粗场；遇到统一陆地/隐式海域时才惰性调用一次 `extractDetailCoastBase` + `createDetailShapeBaseSampler`，之后所有页面复用该 Hbase 闭包。源地图、Hbase、tiles、manifest、blocks 均无公开访问方法。每页 source/locks/refs/stats/operation/boundary 都是新副本，后续请求不接受这些返回值作为权威输入。

本接口不计算湖面、不输出 receiver、不改变 NO_WATER。测试将实际页面交给原内核并检查其原 NO_WATER 语义，未用 0 或海床高程冒充湖水。

## 生命周期与工作预算

- 每页保持原上限：各边 2–512 节点、总计最多 262,144 节点，必须落在真实 2049×2049 节点世界内。
- 创建时调用方必须明确累计预算；内部硬上限是 64 页及 4,194,304 次采样。这是一次操作工作量，**不是全图覆盖**：2049² 实际有 4,198,401 个节点。重叠和重复页面再次消费采样额度。
- readPage 串行运行，不排队，不缓存已返回页面。字段/矩形/预算/并发预检拒绝不消费额度。合法页在开始工作前预扣一次 page 和全部 count，成功返回时 sequence 从 1 增长，sampledNodes 为累计预扣量；无部分成功输出。
- 已接受页的任何来源/owner 变化、取消、进度或调度异常都会永久失效。半页不会发布、重试或退费继续。每个 await 前后以及外部回调前后重验 signal/owner/head；回调中 close 也不能发布结果。
- close 幂等并清除闭包持有的快照、source、locks、Hbase，以及包含 Owned session/assertCurrent/signal/回调的 lease 引用。guarded control 通过 lease 读取 signal，没有单独保留该 signal。进行中的函数局部引用（包括已开始的 yield 回调）在它观察到关闭并退出后释放；不声称 close 同步触发 GC。关闭或失效后的 readPage 永久拒绝。

## 内存模型

一次操作保留一份完整已验证地理快照，避免每过一页重复制，但并未移除该完整世界副本的峰值、哈希工作或 JS 对象/Map/manifest 成本。Owned session 原数据与快照可同时存在。快照复制/验证期间也有自身临时对象。

每个输出页只有两份 Int16Array，共 `4 × pageNodes` 字节，最大 1,048,576 字节。读取器不保留已返回页；调用方若留存所有页，累计页 typed bytes 仍由 `4 × maxSampledNodes` 约束，不能称这些字节等于总 heap。分类循环没有额外逐节点缓存。

Hbase sampler 自身复制并保留 3 个 int32/粗格，即 `12 × coarseCells` 字节；生产 measureGeography 临时分配 xyQ/elevation/area，约 `20 × coarseCells` typed bytes，在 sampler 复制和实际 GC 期间可能与 sampler 的 `12 × coarseCells` 共存。这里不是整体堆内存峰值上限；粗格扫描、full snapshot 验证成本只做一次，未并入逐页 node 次数。

每页有一次 owner 分类与一次实际 sample 循环，单次 Hbase 插值最多沿生产固定 7×7 邻域搜索。每 512 节点有取消/owner/head 检查与调度检查点。累计节点预算不伪称总 CPU 操作数或 GPU/内存验收。

## 四项测试草稿与最小检查入口

1. 使用验证过的 v4 实际几何、显式细海峡、统一陆地、隐式海域及锁，逐字值对照原提取器；多页及重复页仅一次 snapshot/锁摘要/Hbase，并继续交原内核检查 NO_WATER。
2. 回调改动调用方原始地图、expected/预算/矩形，之后改动已返回数组、身份、refs、计数以及 control 函数，后页仍保持固定来源与独立值。
3. 实际 publishReplacement 更换 head、owner lease 脱离、暂停 await 内取消/异常/close 后，已接受页失败且 reader 不能复用；关闭幂等及创建前 owner 失效也拒绝。
4. 非法来源、getter 字段、单页/累计预算均预检；重读重复计数，并发拒绝不损伤已开始页，独立覆盖页数/节点两类耗尽。

根分配 CPU 窗口后才可运行：

```powershell
node .autopilot/ph07/reader-staging/check.mjs first
```

只运行候选 types、定向 lint、这个 4-case 文件；不重跑既有 94 项，不 build/GPU/browser。runner 按 wx 保存首轮 raw logs、单元 JSON、candidate 原字节和实际 src/scripts/配置依赖指纹前后，不覆盖已有 round。任何修复另用新 round。`static-manifest.json` 是首次检查之前的历史静态来源清单；包含首版测试哈希，不是修复后源码清单或检查通过证明。每轮 source-before/source-after 保存该轮实际源码指纹。

后续若采用，只先增加内部私有 reader 文件及必要测试。旧 snapshot 复用这段实现需另行评估参数、回调阶段与错误合同，不能本次顺便改写；两页到多页协调、平坦区跨页解析、贡献样本去重与公开流向协议都尚未完成。
