# Worker 调度候选独立审阅

审阅日期：2026-09-27。范围是 `v4-worker-scheduling-staging/ready-manifest.json` 指定的三个候选及已有检查/浏览器机制证据。只读源码和证据，未运行测试、构建、浏览器或性能测量；未修改生产、候选、配置或其他人的文件。

**结论：没有发现这次差异引入的确定性阻断缺陷；可按基线 SHA 条件提升这三个候选，进入受影响集成与实际游戏验收。该结论不是完整游戏、450 秒失败场景或性能目标通过。**

## 1. 审阅对象与字节核对

`ready-manifest.json` SHA-256：`b7547a6c2f97ac768b8908d5a3e775167583747a0e788e70374e279c64202b2b`。

| 文件 | 核对结果 |
| --- | --- |
| `src/world/worker-yield.ts` | 候选 SHA `ed2dd0cb542d1c5c56b238833b479157a9aca13cdaa8a8e336c79806c6293450` 相符；生产中不存在 |
| `src/world/atlas.worker.ts` | 候选 SHA `6bbc49c5d20df6111a76a08b250f403e5e4336de1b6aa6716052731cd3c413f8` 相符；生产基线仍为 `00c6d9c6dcc70dd837b38ad80dfca359d1c0aa3dd021a369b062bf1fd7acf3d4` |
| `src/world/worker-yield.test.ts` | 候选 SHA `4d95d33b84225fce14d5bc4a664da9dafe4b39cf3d37188fafcaacd21d15b290` 相符；生产中不存在 |

实际 Worker 差异仅为一个 import，以及 `control`、`preparationControl`、`durableControl`、`persist` 分页 checkpoint 的 yield 接线。没有更改 checkpoint 数量、编码/页预算、30 秒 ACK timer、协议、数据库事务、锁、生成参数、算法或规则指纹。

## 2. 关键合同审查

| 项目 | 结论与依据 |
| --- | --- |
| 真正 task 边界 | helper:9–17 `await scheduler.postTask(...)` 等待已排队回调执行；不是 `Promise.resolve()`。缺少 API 时仍等待 `setTimeout(0)`。await 后 continuation 是 promise job，但它只在新 posted task 完成后恢复，原长 task 已真正交出控制。 |
| `this` | helper:10 保留 scheduler 对象，helper:14 以 `scheduler.postTask(...)` 方法调用，未解构或无 receiver 调用。单测精确断言 receiver，真实 Dedicated Worker helper case 也已运行。 |
| 错误传播 | helper 没有 catch；同步抛出由 async 函数拒绝、异步 rejection 由 await 传播，不偷换 timer 重试。单测对两种错误断言同一 Error 对象。下游原有 validator 可能转换成 false，见下述证据范围，不应把“原样”扩展至所有产品错误文案。 |
| 普通取消 | Worker `control`:88–90 保留相同 signal；`model.ts`:335–338、`transactions.ts`:86–90、`storage.ts`:77–82 保留 yield 前后检查。分页 checkpoint:115–117 仍在让出后检查 signal，循环/分页前原检查也保留。消息会在任务边界有机会进入；没有删除取消检查以换速度。 |
| 持久边界 | `durableControl`:99 仍不带 signal，helper 也不向 scheduler 传入 signal。`receive`:72–76 只取消未 durable 操作，`chunk`:45 仅对未 durable 操作检查取消。迟到取消不能使已完成 IDB 的核验被当成回滚。 |
| 提交后异常 | `persist`:143–152、`persistLocal`:165–175 的 durable 标记、CommittedError 和同 command receipt 恢复未改变。Worker 顶层:84–86 仍依据 durable 输出 `fatal/committed`。调度失败发生在已 durable 读取/发布中会走已提交错误路径，不会重试写根。 |
| 原子事务 | `storage.ts`:524–537 与 763–798 保留原事务及完成后无 abort 的语义。新调度未插入这些最终 IDB readwrite 事务体，也没有延后或提前 durable 判定。 |
| 计时 | `preparationControl`:93–95 仍围住真正 await 记录 ownedYields；storage 的 yieldWall finally 仍保留。此次不是从计时项中扣除计算。失败的 preparation yield 仍不产生完成区间，这是原实现已有行为；失败不应成为有效性能样本。 |

平台依据：调度规范把 postTask 定义为独立 event-loop task，接口暴露于 Worker，返回的 Promise 对应 callback 完成/失败；background 为最低 scheduler 优先级。这支持真实任务边界，但不承诺每个 checkpoint 都处理一个输入、跨任务源严格先后或固定完成时间。[WICG Prioritized Task Scheduling，§2.1、§2.2、§2.4](https://wicg.github.io/scheduling-apis/)

## 3. 已有证据能证明什么

`checks/repair1/results.json` 实际记录 3 总项、3 通过、0 失败；verification 记录耗时 2053.7754 ms、exit 0。overlay 只载入三个 owned roots 及依赖类型闭包；三文件 lint 零错误/警告。它没有运行完整旧 Worker suite。

`checks/browser-mechanism-repair1/verification.json` SHA-256：`96aff40ccae104c5dac030b0bc1e8ef80078d5e980f405ddda608413c2b93ca6`。

实际环境为 Headless Chromium `153.0.8010.12`、localhost 同源 Dedicated Worker。探针直接转译并拼入相同 helper（helper SHA 相符），每个 case 建立独立 Worker。不是主线程 mock，也不是只看 API 配置。

| 实际分支 | 请求 | 实际完成次数 | 实际结果 |
| --- | --- | ---: | --- |
| 直接 timer | 256 次 | 256 | 总计 1252.6 ms，无取消 |
| 直接 timer | 第 64 次 checkpoint 由 parent 发 cancel | 65 | 收到真实消息并停止；parent 往返 4.2 ms |
| 实际 helper / postTask(background) | 256 次 | 256 | 总计 2.4 ms，无取消 |
| 实际 helper / postTask(background) | 第 64 次 checkpoint 由 parent 发 cancel | 66 | 收到真实消息并停止；parent 往返 0.1 ms |

四项 passed；browserErrors 为空；被观察生产/候选/dist/build.json 前后 SHA 稳定。零或 0.1 ms 的单次 span 是该环境的计时分辨率现象，不能解读为没有 task。取消通过真实 parent→Worker 消息，证明该次运行的任务间插入实际发生。

这些数值只能说明该空回调机制探针，不证明完整地图算法提速比例、主线程绘制、内存、队列压力、Safari fallback、真手机表现或 450 秒原失败已解决。background 也不是在所有负载下保证最快的优先级。

首轮失败仍应保留：`checks/first` 配置误继承旧 include，主动终止且不计 unit PASS；测试 this alias lint 失败；`checks/browser-mechanism-first` 在 about:blank Blob module Worker 启动阶段失败，0 个机制 case。repair1 没有覆盖这些原始记录。

## 4. 非阻断的证据边界与最小后续

1. **“错误原样传播”只对 helper 本身证明充分。** `model.ts`:208、226 的既有 catch 会将非 AbortError（包括被注入的 scheduler 失败）转换为 false，随后上层可能报告格式/几何无效。没有吞错继续成功或写错根，但不能用现有 helper 单测声称所有校验路径保留 scheduler 原错误文本。该转换不是此候选新引入，不建议为本次调度切片扩写全模型。
2. **新 durable 单测检查的是 control 语义，不是真 IDB 提交重放。** 它人工设置 active.durable，再证明取消 signal 未透传。推广时应复用现有 Worker 测试中真实存储的迟到取消、丢完成回执、无法恢复 receipt、初始化传输失败案例（`atlas.worker.test.ts`:255、274、296、336、346、370、379、393），并覆盖真实 postTask 接线后的同一路径。现有 staging 的 3/3 不能替代这些受影响测试。
3. **浏览器探针自身有一个未来防漏项。** `probe.mjs` 会收集 browserErrors，但其最终 passed 只与 case/sourceStable 合取，未明确与 `browserErrors.length === 0` 合取。本次实际数组为空，因此不推翻本次证据；下一次维护 runner 时应把非空错误数组纳入失败条件。此项不要求修改生产 helper。
4. **fallback 的证据范围有限且诚实。** 新单测确实调用 helper 的缺失 API 分支，实际浏览器 timer case 则直接调用 timer，并未强制 helper 在无 scheduler 浏览器执行。保留能力检测与原 fallback 足以避免硬依赖；不要据此标记 iOS/真机已验收。

可执行顺序：

- 提升前再次比对三个候选 SHA 与生产 Worker 基线；若基线变动，只合并上述控制层小段，不能整文件覆盖其他工作。
- 由主执行者统一安排一次受影响 Worker/协议/存储检查与必要构建，保留本次调度候选的实际来源；不要声称本审阅已执行这些检查。
- 对原目标游戏流程重做一次同条件、同门槛的浏览器验收，验证完成/取消、主备与 receipt、刷新恢复和实际阶段耗时；原 450 秒失败及原始日志留存。只有该证据才能决定是否解决真实卡顿，不能依据 256 次空 yield 比值判定。

本审阅没有生成新的 PASS 测试记录、没有修改任务状态，也没有授权云端写入。
