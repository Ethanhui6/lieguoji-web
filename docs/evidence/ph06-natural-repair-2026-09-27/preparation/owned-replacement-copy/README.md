# 私有完整候选导出分批复制 — 待验证候选

状态：仅 staging 实现与人工静态审阅。尚未提升到生产；未运行 lint、TypeScript、单元测试、浏览器或性能测量；没有本批 PASS、性能改善或 PH 完成结论。

## 绑定与唯一运行时代码边界

- 生产基线：`src/world/transactions.ts`，SHA-256 `f8df63985e443d77b87c43a0eff9ef90034b258a118f3f6fdcccf5acb4114789`。
- 精确原始基线副本：`transactions.baseline.ts.txt`；候选镜像：`src/world/transactions.ts`。
- 仅两个 import 增补和 `OwnedAtlasSession.replacementDocumentAsync()` 实现不同；完整 diff 已人工核对。
- 新窄测：`src/world/detail-owned-replacement-copy.test.ts`，8 个案例；生产尚无同名文件。
- `ready-manifest.json` 绑定基线、候选、测试和支持文件 SHA；提升前须重核生产基线，不能直接覆盖别人后续修改。
- 单独 Vitest 配置只选本文件，不继承整个产品测试 include；未执行过该配置。

## 所有权与协作边界

源只来自本会话私有 `#fullCandidate(candidateId).data`。该数据已在公开 prepare 入口同步取得全部调用方缓冲区的所有权，并经过完整格式、几何、锁、引用和摘要校验。

目标先建立新 manifest 和空 Map，再逐项复制全部 coarse blocks、locks、fine tiles。每类最多 16 项一个批次，末尾不足 16 项也 yield。复制期间目标保持局部私有，任何进度或调度 callback 都拿不到半份结果。全部块继续调用原来的逐块 clone/校验 API；没有新 trusted 参数，没有不核验的解码入口。

进度 callback 前后、yield 前后以及最终核验前后都检查 AbortSignal 和 candidate/source 对象身份。默认 yield 仍是实际 `setTimeout(0)` 任务；若调用方传入 `yieldTask` 则沿用它，包括现有 Worker 调度。未把 `Promise.resolve()` 当默认任务边界。

复制完成仍调用原 `verifyAtlasDocument()`，按真实 v1/v2/v3/v4 格式完整核验几何、结构、引用和内容摘要。返回后 manifest、Map、coarse/lock/fine buffers 均独立。取消、进度/调度异常或最终核验失败不发布、不清空私有候选，调用者可重试或主动 discard。

`OwnedAtlasSession` 没有 dispose 方法。本文件用真实 `discardReplacement()` 和 `publishReplacement()` 测试导出期间候选失效，另测 discard 后新候选替代旧候选；不伪造不存在的 dispose API。

## 没有改动的合同

- `open()`、`prepareReplacement()`、`snapshotAsync()` 与全部公共 raw clone 的首次 await 前接管合同原样保留。
- 同步 snapshot/replacement API、format codec、schema、origin/locks/history、撤销预算、generation/constraints session 未改。
- Worker/bridge/protocol、传输、分页、IndexedDB CAS、durable/receipt、ACK 与取消持久边界未改。
- 未消除 Worker confirm 的重复导出；本批只改一个共享的私有候选导出接口。
- manifest 的 structuredClone 仍同步。每个小块的 clone/严格校验仍同步；16 项是项数上限，不是已证实的毫秒预算。

## 新窄测与复用边界

复用现有 `detail-private-ingress.test.ts` 的 33 个真实 sampled tile 构造方式，加一个远端真实 lock 和完整 codec/hash 引用；只写当前方法的窄测试，不镜像现有大套。合成负高程变化用于所有权测试，不宣称地形生成或视觉验收。

1. 33 个 tile 真实复制量为 16/16/1；真实 timer 在下批前可执行；不再进入公共整图 clone；最终全内容一致。
2. 第二 fine 批 timer 投递的 AbortSignal 阻止第三批并保留候选，随后可重试。
3. 悬停于第一 fine 批期间 discard，旧导出拒绝且当前头/原图不变。
4. 同一位置 publish，旧导出拒绝且已发布的候选不被回退。
5. discard 后安装另一个有效候选，旧导出拒绝，新候选可独立导出。
6. 改动 prepare 的原始调用方对象、导出 manifest/三种 Map、细海岸两数组、coarse 高程/坐标与 lock flags，均不影响私有权威数据或另一份导出。
7. 对复制结果的最后 fine tile 注入合法形状但错误摘要的数据，真实完整核验必须拒绝；原候选仍可重试。
8. fine-copy 调度器真实 reject 保留原错误对象，候选与当前头保持不变。

第 4 项的 receipt 是 Owned 层合成回执，仅验证发布对正在导出的候选身份的影响，不是实际 IDB 提交证据。普通测试超时未调整；fixture 的 beforeAll 沿用现有构造的 30 秒上限。

现有 `cooperative-ownership.test.ts` 的 raw 首次 await 前接管、snapshot/head 变化、discard 和 generation confirm 取消保留候选合同继续适用，未来提升时应复用这些测试；本轮未复制或执行它们。

## 将来允许检查后的最小验证

在根执行者给出 CPU 窗口后，只运行本 staging 配置的单文件窄测及相关静态检查；若发现失败先保留首轮结果。后续是否提升由根执行者决定，提升前重新核对生产基线 SHA。

33 tiles 仅证明跨批次正确性；4096 sampled tiles 的实际 Worker 首次任务/最大批次/取消响应仍需下一窗口实测。旧 dense helper 首 yield 483.73 ms 不是本候选结果；完整 confirm 总耗时也不能据此推断改善百分比。公共 raw dense 同步接管问题没有在本批关闭。

人工静态结论：这个边界成立，因为源已私有拥有、没有可改权威引用跨 await 暴露、返回前完整核验和候选身份检查仍在。该结论不替代执行测试与性能验收。
