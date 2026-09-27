# preview.8 确认延迟只读审计（2026-09-27）

本次只读核对确认、存储、细海岸 codec、Worker 传输与接收端校验；没有运行测试、基准或修改产品。原始失败保留在 `.autopilot/ph06/additive-checks/desktop-first/`。其 `verification.json` 实际 `code:1`、`elapsedMs:459364.5352`、`sourceAndDistStable:true`，原日志为整项 450000 ms 超时；最后等待重叠拒绝提示时仍未完成生成。父代理观察到 revision 3 的 `data-atlas-durable-ms=36642`、`commit-ms=44676.5` 和约 3.7 MB 响应，这三个数是已有 UI/trace 观测，以下未把它们冒充函数 profile。

## 指标实际覆盖范围

`AtlasStudio.tsx:309` 在调用 `client.confirmGeneration()` 前取 start，其 Promise 返回时取 durableAt，随后调用 `accept`。`accept:73–95` 等待 renderer.accept 后才计算 commitMs。

- durableMs 36.642 秒覆盖**整次确认往返**，含 Worker 候选校验/复制、prepare/stage/commit、已提交存储会话重开、逐块传输 ACK、接收端完整校验及独立视图复制。它不是 IndexedDB 事务耗时或物理磁盘时间。
- 两指标相差 8034.5 ms，是确认返回至 renderer.accept/UI 完成的间隔，不能称为纯 GPU 时间。
- `refreshList` 在上述 accept 返回后才执行，不在这两个指标中。
- Worker 对完整存储路径明确加入 `full-storage-path-not-instrumented`，重开加入 `storage-session-open-or-reopen`。`storage.ts` 的 LocalTiming 当前仅覆盖 local/replay；不能套用它推算本次完整确认。

## 首要候选：每 8 块暂存重复扫描全部主备

`atlas.worker.ts:persist` 把所有 coarse blocks、locks、detailCoast 放入数组，固定每 8 项调用一次 `stageAtlasBlocks`，包含已存在、内容未变的块。`storage.ts:459–475` 每次调用都重新打开库、读取准备记录和候选 manifest、读取原根，然后：

1. `rootProtectionRows:354–366` 依次扫描原主档与备档的**全部内容引用**。每 16 引用做一批 IDB 读取；每条执行领域/codec 校验；每批 checkpoint 真正让出。
2. 细海岸的 `assertCodec:289–291` 会调用完整 `decodeDetailCoastTile`，而非只看头。
3. 当前+备份重复引用直到两轮扫描结束才按 key 去重；重复原像仍会在预检阶段重复读取/解码。
4. 最终 readwrite transaction 再次 get 全部 protectedRows，并以 `assertUnchanged` 做逐字节原像 CAS。已存在的 candidate blob 在此确认一致后不重写，但前面的整批保护开销已经发生。

设候选总项数 N、主档引用数 C、备档引用数 K，批次 B=ceil(N/8)。仅暂存阶段的保护引用访问量由源码可知约为 B×(C+K)，保护 checkpoint 数为 B×(ceil(C/16)+ceil(K/16))；另有每个 stage 的 hash checkpoint、Worker 外层 checkpoint、manifest 验证、事务读取。**这是算法次数关系，不是实测耗时分摊。** 约 3.7 MB 响应不能排除这种重复工作。

当前 fine owner 规格必须使用 `detail-coast-types.ts:8,52–56`：tileCells=32，通常 1024 节点、样本编码 4112 bytes；西/北边界 1056 节点 4240 bytes，西北角 1089 节点 4372 bytes。不是 16 KiB。uniform land 为 16 bytes。

`detail-coast-codec.ts:75–89` 对 Uint8Array `Reflect.ownKeys(bytes)`，创建约 4112–4372 个键；分配两组 Int16Array、逐项 DataView 解码，再调用完整 validate。后者 `ownedInt16:9–12` 还对两组样本数组 Reflect.ownKeys，`validateValues:27–32` 再逐样本验证。保护页重复解码因此含重复键列表/数组分配和循环。这些是确定的调用路径；没有测得 GC 或各函数占比。

## 其他确认内候选，均尚未计时

- `generation-session.ts:125–131` 的 confirm 已调用 `replacementDocumentAsync` 并返回 `{data,preview}`；Worker `:277–279` 只取 preview，随后又调用一次 replacementDocumentAsync。`transactions.ts:437–442` 经 `cloneVerifiedAtlasDocument` 到 `generation-format.ts:115–125`：私有复制后验证全部几何和内容摘要，因此这里确实重复一次完整复制/验证。
- `prepareAtlasCommit` 读取并验证主备；`commitPrepared:510–517` 再读主备和候选完整内容，最后独立重验锁；提交后 `AtlasStorageSession.open:624–630` 又通过 rootContents 校验新主备。必须保留这些信任边界，不能以未经验证缓存替代。
- `readContent:309–311` 对细海岸先 assertCodec（解码一次），再 SHA，随后 decodeContent（再解码一次）。这与保护扫描是不同路径。
- `initialize:153–178` 每个 coarse/lock/fine 块都 `await chunk`；`chunk:43–51` 等单块 ACK 才发下一块。bridge `:253–267` 解码、重算细块 SHA 后才 ACK；complete 后 `receivedDocument:152–155` 再完整 verify，`:325–344` 再建独立视图。ACK 记录覆盖主线程处理和调度，不能直接称为网络耗时。
- storage checkpoint、generation/detail checkpoint 和接收端视图复制存在 setTimeout(0) 默认让出。嵌套 timer 等待可形成累积延迟，但本审计没有逐次实测 timer wall，因此不能把 36 秒归因于 timer。scheduler.yield（能力检测）或 MessageChannel 可作为后续真实任务调度候选；不得用 Promise.resolve 微任务代替真实让出，不删 checkpoint/取消检查。

## 一项最小后续 profile

在当前浏览器完全结束后，为**一次既有场景的确认**加入 request/commandId 绑定的汇总时间记录，不循环压力测试，不打印逐块日志，不改算法、batch、校验或 deadline。范围优先 Worker + storage：

1. Worker 按互不重叠外层阶段记录 confirm 返回、第二次私有复制、prepare、全部 stage、最终 commit、reopen、initialize/ACK 总间隔；记录候选 coarse/lock/fine 数、实际 stage 页数与 bytes。
2. storage 在 stage 的 rootProtectionRows 汇总调用数、引用访问数/bytes、fine decode 次数、readonly 调用数、checkpoint 次数及实际 yield wall、最终事务 wall。同步 codec wall 单独累计，防止把 yield/IDB 等待称为 CPU 工作；嵌套区间只报告为父阶段的细分，不能重复求和。
3. 复用现有 receiverVerificationMs 和 DOM 总间隔作覆盖核对；initialize 的 ACK wall 与 receiver 验证有重叠，不相加为额外总耗时。区间未覆盖部分标 residual，不称磁盘时间。

该一次 profile 能区分「大量小页导致保护重扫」「timer 空等」「最终锁/几何核验」「提交后重建/ACK」；记录 before/after 源码和构建 SHA、原始 JSON、计数、失败。若先采用已有 512 KiB 上限的精确分页减少 B，也应在改后同一检查保留这些分项，不声称已证明原 36 秒中的比例。

任何优化都必须保留未知版本/codec 拒绝、主备完整根 CAS、同摘要原像比较、锁保护、精确容量账、取消与已持久回执语义。不能为提速增大现有 512 KiB 页上限、扩大预算或延长 450 秒验收门。

## 本次读取源码 SHA-256

```
src/world/storage.ts 46d93b707fe20b1136c8008d474e56460cdcb156bc5e710246250e1f0ba3e038
src/world/detail-coast-codec.ts df88c7f8b06625ab17025369c1202b6276e164085b9bb8da1da48f983f6cff58
src/world/atlas.worker.ts 2e61d7acd71eea6ad7476c2ecd154ea886cc70a1a48ab4530c3753c890068ffc
src/world/bridge.ts 413834ec234a995fa13f04e670f760b2407c42f7e57f18d35093217f0b3e83cf
src/world/transactions.ts f8df63985e443d77b87c43a0eff9ef90034b258a118f3f6fdcccf5acb4114789
src/world/generation-session.ts 0b01a265795fbc43f43c70d928c417fde769782e58c44137431f68ecb79a5b74
src/world/generation-format.ts 216332c924ea613263d7da749861f70a7f39fbfd466cbb549d515e340d921997
src/editor/AtlasStudio.tsx c267a0b737c7cae259a3e2b33788f09e3d97bf7dfda0f6f4bfdd488134e7ff95
```

仅以上小范围源码与完成 runner 的短日志/verification 被读取；未读取真实存档、凭证或其他项目，没有扫描整仓、运行 profile 或测试。
