# 私有当前快照分批导出候选

状态：仅 staging 实现与人工静态审阅。没有提升生产；未执行 lint、TypeScript、单元测试、构建、浏览器或性能测量，不代表本批 PASS 或 PH06 完成。

## 精确边界

- 基线为实际 preview12 工作区 `src/world/transactions.ts`，SHA-256 `368f02ea7cfee00ea5285daa27d016dceec9d0db690b60dc86ba251f59121e3d`。
- 原始字节保存在 `transactions.baseline.ts.txt`。镜像只有 `OwnedAtlasSession.snapshotAsync()` 方法变化；import、其他方法和生产文件均未改。
- 新测试为 `src/world/detail-owned-snapshot-copy.test.ts`，展开参数化用例后 11 项。生产中尚不存在该文件。
- `ready-manifest.json` 绑定生产基线、镜像、测试及读取依赖。提升前必须重验基线，不可直接覆盖其他人的改动。
- `vitest.config.ts` 仅为以后允许执行时解析镜像与既有生产依赖；本轮未执行它。

## 所有权与回调重入

公开 `open()` 和 `prepareReplacement()` 已在首次 await 前同步取得并核验全部调用方字节，私有 `#data` 不可经读接口修改。本方法只把这一既有私有源按最多 16 个地理块、16 个锁块或 16 个细 tile 一批复制。每类末批不足 16 项也让出；细图复制从之前的全部同步接管改为真实分批，不向回调暴露半份目标。

复制前捕获源对象、源 manifest 对象、格式版本、revision、持久根摘要和 manifest 摘要。每次进度回调前后、调度回调前后以及最终完整校验前后重验这些身份和 AbortSignal。正在执行的回调如果发布了另一份来源，即使它在完整 hash 校验阶段发布，也会拒绝旧快照，不返回混合内容，也不回退新发布的来源。

候选的单纯 prepare 或 discard 不改变已发布源，所以不应使快照失效；测试明确保留这一现有语义。没有把 pending candidate 当成 snapshot 的版本标识。

默认调度仍是实际 `setTimeout(0)` 任务；传入 `yieldTask` 时保持原接收对象的调用方式并等待其 Promise，异常保持原对象传播。完整复制完成后仍调用 `verifyAtlasDocument()`，按真实 v1/v2/v3/v4 内容验证地理、锁、细地形、引用与摘要，然后再次核验源身份。返回的 manifest、Map 和全部类型数组保持独立。

## 关闭、取消与持久事务

`OwnedAtlasSession` 没有 close/dispose 方法。现有 `AtlasWorkerRuntime.close()` 在 `src/world/atlas.worker.ts:33` 中取消当前 active 操作的 AbortController；普通 control 在该文件第 91 行起传递同一个 signal。测试覆盖这个 AbortSignal 边界，不声称调用了不存在的 Owned.close，也不是新增 Worker 生命周期集成验收。

取消、进度异常、调度异常及最终完整核验失败都只丢弃局部导出，不修改当前头、私有数据、已有候选、撤销记录或持久存储。Worker 的 durable control、commit/receipt、CAS、分页/ACK、protocol、bridge 均未改。

公开 raw 的首次 await 前完整接管原样保留；没有增加 trusted 标志或跳过验证入口。同步 `snapshot()`、私有候选 `replacementDocumentAsync()`、所有 codec 与版本规则均未改。

## 必要窄测

合成 fixture 复用现有 private-ingress/replacement 测试的 33 个真实 sampled owner 布局：北/西边界与远端世界角都有实际样本，另含一个真实非零锁块。负高程是所有权测试资料，不是玩家存档或自然生成视觉验收。

1. 首个进度实际只已复制 16 个粗块、尚未复制 fine tile；33 个 fine tile 分成 16/16/1，真实 timer 在下批前运行，公共整图 clone 不再被调用，最终完整结果相等。
2. 第二 fine 批由真实 timer 触发取消，阻止第三批，源不变且可重新导出。
3. 在 fine-copy 进度回调中发布另一份完整候选，立即拒绝且不再复制后续 tile。
4. 在细海岸摘要验证进度回调中发布另一份候选，也拒绝旧快照。
5. 在真实悬停的 yield Promise 期间发布新来源，恢复后拒绝旧快照并保留新发布值。
6. 同一悬停期间仅 discard 未发布候选，快照正常完成，原头保持不变。
7. 首次回调修改 open 的原始输入不会影响私有源；返回的所有粗块、几何坐标/顶点 ID、细场两数组、lock flags、Map 与 manifest 均独立，修改第一份不影响第二份或后续快照。
8. 对最后一块导出副本注入合法数值但错误摘要，真实完整 hash 校验拒绝，原源可重试。
9. 进度回调异常以原 Error 对象传播，源不变。
10. 调度回调异常以原 Error 对象传播，源不变。
11. 旧 v1 保留泛型返回、规范 manifest 字节和独立缓冲，不重新进入公开 raw clone。

发布测试使用 Owned 层合成回执，只验证来源变化合同，不代表真实 IndexedDB 提交。未扩大普通测试超时；fixture 构造沿用已有 30 秒 beforeAll 上限。v1 用例比较实际输入的规范字节，既有静态黄金 fixture 未改、未重生成，原有黄金测试仍须按根的检查范围复用。

## 仍需实际验证的范围

- 本轮只有 source/diff 静态审阅。11 项用例均未执行，不能当作通过。
- 授权窗口可对新单文件运行定向检查，或提升后与已有 `cooperative-ownership.test.ts`、`detail-owned-replacement-copy.test.ts` 一次统一验证；避免重复整个套件。
- manifest 的 `structuredClone()` 和各单块的严格 clone/校验仍是同步的。16 项是项数上限，不是已证实的毫秒预算。
- 33 tiles 验证批次合同；4096 tiles 的实际 Worker 首任务、批次长任务和用户点击取消仍需实测。旧历史 483.73 ms 不是本候选的测量结果。
- 不关闭公开 untrusted dense ingress 成本，也不声称全生成/确认链已满足 250 ms 进度门或已证明性能改善百分比。

人工静态结论：现有私有所有权边界支持这一个方法的最小改造，无需协议或版本变更。是否提升由根执行者在统一验证后决定。
