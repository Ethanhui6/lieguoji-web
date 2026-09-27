# 私有 snapshotAsync 候选独立复核

日期：2026-09-27。只读对照当前生产 `src/world/transactions.ts`、`v4-owned-snapshot-staging/ready-manifest.json` 所绑定镜像与新测试。没有运行 lint、类型检查、单元、构建、浏览器或性能测量，没有修改生产及冻结候选。

## 结论

**未发现可复现的 correctness / 所有权阻断，可以进入根安排的定向检查。** 当前改变仅为 `snapshotAsync` 的已私有源复制方式，不把私有快路开放给调用方 raw 数据。16 项是批次计数，不是250ms性能保证。

核对的实际 SHA-256 与 ready 一致：

- 生产基线 `transactions.ts`：`368f02ea7cfee00ea5285daa27d016dceec9d0db690b60dc86ba251f59121e3d`。
- 镜像 `transactions.ts`：`5ee973e9d66697b4be0dc27c521d38e37d74f81ea68e13cbc8213ce9f21838dc`。
- 新测试：`c11230a864ae8c156efb0482936057c4acfa7ded1cdb9a326eaec702e2e77a17`。

## 已核代码边界

1. **私有来源成立。** `open` 仍先 `cloneVerifiedAtlasDocument(raw)`，之后才把 owned 交给构造器。`readBlocks` / `readLocks` / `readDetailCoast` / `manifest` 均返回副本。候选生成及公开完整替换的原验证入口未变；普通 patch 对写块先复制，不能通过未发布候选改动当前源。新 `snapshotAsync` 不接收文档输入，也不暴露 skip/trusted 参数。

2. **无返回别名。** manifest 使用 structuredClone；blocks 为新 Map 且每项 cloneBlock；v2/3/4 locks 为新 Map 且每项 cloneAtlasCellLockBlock；v4 fine 为新 Map 且每项 cloneDetailCoastTile（两 typed arrays 均独立）。初始化时临时展开 source 的旧 map 引用，会在第一次 await 前被对应空 map 全部替换；半份 owned 从不交给回调。

3. **版本变化不会返回混合快照。** 复制前捕获 #data 身份、manifest 身份/format/revision、rootDigest、manifestDigest；复制阶段每次进度回调前后、每次 await 调度前后以及完整验证前后均 `check()`。现有 publish / publishReplacement 都整体替换 #data 并更新摘要；即使在源复制或 hash 验证回调中发布新版本，下一个同栈或续接 check 都拒绝旧导出。拒绝路径不写 session，也不会回滚已经发布的新来源。单纯 prepare/discard 不改变发布源，因此允许原快照完成是正确语义。

4. **取消与错误传播保留。** 每批 checkpoint 和 guarded callback 检查 AbortSignal；调度 await 前后再次检查。无自定义 yieldTask 时仍使用真实 setTimeout 任务，有自定义时通过 `control.yieldTask()` 保留原 receiver。进度/调度异常自然向外传播；没有捕获后继续返回半份快照的路径。完整验证中的 yieldAtlas 也使用同一 guarded control，所以验证期间的取消/来源变化同样被拦截。Owned 没有独立 close API；Worker 关闭对应 active AbortSignal，不应声称新增了另一套关闭语义。

5. **格式/公开校验未放宽。** v1 只复制 manifest/blocks；v2/v3 增加 locks；v4 再增加 detailCoast。泛型 T 保留。最后仍调用真实 `verifyAtlasDocument(owned, guarded)`，各版本精确封套、几何/引用、实际内容 hash 检查没有删除。公开 `open`、`prepareReplacement`、同步 snapshot、codec 和存储事务的字节均不在 diff 中。现有 v1/v2/v3/v4 数据解释保持原样。

## 新测试的实际覆盖与局限

已写 **11 个展开场景，尚未运行**。它们有实质断言：首16粗块即让出且尚无fine复制、33fine按16/16/1真实timer交错、批间取消后源可重试、复制回调与最终hash回调发布新源拒绝、悬停await中发布拒绝、仅discard允许完成、入口及返回副本的多层无别名、最后fine块错误hash仍拒绝、两种回调异常原对象传播、v1规范字节和隔离保持。

这11项直接构造v4与v1；v2/v3兼容是本次静态路径结论，不能表述为该新文件已经实测两版。根的最小统一范围可复用既有 `cooperative-ownership` / `detail-owned-replacement-copy` 的相应旧版证据；若缺直接 `snapshotAsync` 的v2/v3覆盖，只需给本文件现有旧格式导出用例增加两版参数，不需要扩大全套。

测试的 publication 使用 Owned 层合成回执，准确检查 session 来源竞争，但不是 IndexedDB durability / CAS 新验收。fine误摘要使用 clone函数spy注入副本异常，目的为证明最终校验未删，不冒充公开raw破坏场景。

## 性能判断边界

manifest 的 structuredClone 和单块 clone/严格校验仍同步；每16项才让出不能直接承诺每批耗时。33 sampled tiles 只验证批次合同，不代表4096 tiles或实际Worker全过程。公开不可信raw首次await前接管完全保留，因此本改动也不代表 public dense 250ms 门已通过。后续若做测量应独立记录真实Worker首任务/进度/取消，不复用旧483.73ms为候选结果。
