# 私有快照的真实密集 Worker 测量准备

状态：**prepared-not-run**。本目录只有可执行测量准备、人工静态审阅和文件摘要绑定；没有执行 fixture、单元测试、类型/lint、浏览器或性能基准。不存在本批实测结果，不能据此关闭 PH06 或进度/取消门。

2026-09-27 后续实际执行：`checks/first` 在 Worker 导入时失败，`__MACRO_GENERATOR_FINGERPRINT__ is not defined`，setup=null、cases=[]，不是性能结果。该轮原脚本与ready保留。根根据当前安装的Vite源码 `workerFileRE` 修正动态入口为 `?worker_file&type=module`，使真实define/env进入Worker；产品代码、fixture、250/500门未改。下一轮使用新目录，来源清单重新绑定此单一harness入口修正；上方prepared状态描述原始交付时点。

## 测量对象及现有协议限制

冻结目标是前一目录 `v4-owned-snapshot-staging/src/world/transactions.ts` 的 `OwnedAtlasSession.snapshotAsync()`。没有修改该冻结候选，也没有修改生产文件或 dist。

实际 `AtlasOperation` 没有 snapshot-only 消息。`generation-session.ts` 通过私有 snapshot 开始预览，随后还执行生成、保护核验、候选准备与传输；产品现有 timing ledger 不能把这些步骤精确拆出。因此本目录创建一个独立的 **Chromium dedicated Worker**，直接导入冻结候选方法、真实生产 codec/验证器，以及实际 `yieldAtlasWorkerTask()`。它复用现有 `v4-worker-scheduling-staging/probe.mjs` 的真实 Worker + postMessage 取消方式。

这是方法级真实 Worker 测量，不是 AtlasWorkerRuntime 协议往返、游戏 UI、存储确认、渲染帧率、移动设备或真机验收。没有修改 protocol，也不会把主线程/Worker 的不同 performance.now 起点直接相减。

## 真正密集的工作量

`fixture.ts` 复用 `src/world/detail-coast.test.ts` 中 dense takeover fixture 的所有者布局与默认样本值：

- 64 × 64 = **4096 个 samples tile**，没有 absent/uniform-land 代替项。
- 包括北/西边界的附加 owner 节点，总计 **2049² = 4,198,401 个真实节点**。
- 每节点一项 coverage Int16 和一项 elevation Int16，共 **16,793,604 字节**实际数组；加 4096 × 16 字节 tile 编码头为 16,859,140 字节。
- coverage = -32767，高程 = -1200，与已有 dense fixture 默认海样本相同；低值复杂度不会把 `mode:samples` 转成稀疏或 uniform 路径。
- 粗世界使用当前最大 **512 × 512**，同时覆盖最大粗网格复制与几何核验。锁为空，区域锁行为继续由独立锁测试覆盖。
- 全部 tile 引用经真实 hash 构建，整份源经真实 `verifyAtlasDocument()` 验证。完全是程序合成资料，没有读取玩家存档。

fixture 构造、4096 个源 hash 和 `OwnedAtlasSession.open()` 的公开接管属于准备阶段，分别记录实际 `fixtureMs`、`publicSessionOpenMs`，不计入后续私有方法窗口。这个分离是为定位成本；若解释产品整体时间，这些准备耗时不能被隐去或从整体结果扣掉。

Owned 层使用固定合法形状的合成 root 身份（64 个 `a`），与已有所有权测试一致；它不冒充真实 IndexedDB 持久根。fixture 内容摘要和代码指纹则均由实际字节计算。没有创建或打开真实玩家数据库。

## 固定最小运行序列

单个真实 Worker 完成准备后，按以下次序运行。没有额外 warmup、重复取优、自动重试或阈值调整；前序 fixture/open 会自然影响 JIT/缓存，所以结果明确属于**已建立会话**，不宣称冷启动性能。

1. 私有 `snapshotAsync()` 完整复制和完整验证一次。
2. 未改变的公开 `cloneVerifiedAtlasDocument(raw)` 完整调用一次，独立记录公开同步接管成本。
3. 私有调用发出 measurement-started 后，由主线程立即 postMessage 取消。
4. 私有 fine-copy 首个 16/4096 进度到达主线程后，由主线程 postMessage 取消。
5. 私有 fine 摘要验证首个 16/4096 进度到达主线程后，由主线程 postMessage 取消。

取消不是进度回调内部直接 abort，也不是 Worker 自己的 timer 冒充外部输入。它必须经过真实主线程消息投递、Worker 事件处理和原有 AbortSignal 检查。完成或拒绝时 Worker 立即发 settled 消息，之后才做输出审计，因此主线程的取消响应不混入额外审计。

## 原始指标与不放宽的门

Worker 自己的时间轴记录：

- `synchronousCallPrefixMs`：方法调用开始至返回 Promise 的墙钟间隔。公开 raw 入口的同步接管会在这里出现；私有批次入口单独记录。
- `firstProgressMs`：调用开始至真实首个进度回调，不含 fixture/open。
- `progress` 全序列和 `maxProgressGapMs`：从调用开始、每个真实进度到最终 settled 的间隔，包含无进度的尾部。
- `yields`：每次实际调度函数进入/恢复时间；`maxYieldEntryIntervalMs` 含调度等待，`maxActiveGapMs` 是上一调度恢复至下一调度进入的墙钟间隔。后者也可能含验证函数内 await，不冒充 CPU 时间。
- 每段有结束阶段名称以及 copy/verification 分类，可从原始序列复算，避免把前一阶段的时间归给后一批。
- `cancelReceivedToSettledMs`：Worker 真正收到取消到方法拒绝的同钟间隔。

主线程自己的时间轴记录：

- 发出 run 到收到首条进度，以及所有进度接收间隔到 settled；包括 Worker 消息排队和传递成本。
- `cancelSendToSettledReplyMs`：实际发出取消到收到方法已拒绝通知，涵盖 Worker 忙碌导致的消息延迟。

完整调用的进度门固定 **250 ms**：首次进度、最大进度间隔（Worker 回调与主线程接收两侧）及最大 yield 进入间隔都必须满足。取消病例固定 **500 ms**：主线程 send→settled reply 和 Worker received→settled 都须满足，且必须真实 AbortError、未返回成功快照、取消实际到达。取消病例仍保留全部进度指标，主要验收取消响应；完成调用已独立承担完整流程的 250 ms 门。

不能用 `null`/NaN 缺项通过：完成的私有复制还必须证实 256 个 fine-copy 批次，其完成数严格为 16、32、…、4096，以及最终完整验证成功、输入身份不变、真实输出仍有全部 4096 sample arrays。输出审计发生在计时结束后，检查规范 manifest、节点数、数组总字节和返回 buffer 对来源的隔离。

`candidateSnapshotGatesPassed` 只针对上述四次私有调用。公开 raw 的 `publicRawDiagnosticGatesPassed` 单列，即使失败也原样保留，不改门、不伪称公开入口问题已修好。任何未通过项都保留原始 JSON；过程不自行重跑。120 秒 setup/case watchdog 仅防测量进程永久挂起，与 250/500 ms 验收阈值无关，触发即失败。

## 来源绑定和后续执行

`prepare-manifest.mjs` 只做轻量静态依赖发现与 hash 记账，不导入产品运行时或执行测量。`ready-manifest.json` 绑定冻结候选、实际相对依赖闭包、脚本和 fixture 参考。运行前逐文件校验，期间前后再次校验；源码变更必须明确复核/重绑定，不能默默继续。

生产 transactions 只允许已知原基线或该候选提升后的精确 SHA，便于根在统一提升后使用同一测量脚本；其他来源变化必须先人工复核。运行期间任何来源改变均判失败。

获根分配的空闲 CPU/browser 窗口后，从项目根执行（**本轮尚未执行**）：

```powershell
& 'C:\Program Files\nodejs\node.exe' .autopilot/ph06/v4-owned-snapshot-metrics-staging/run.mjs first --execute
```

每次必须给新的显式 label；已有 evidence 目录拒绝覆盖。脚本只启动本地 Vite 开发服务与独立 Chromium Worker，使用当前真实构建 defines，不执行生产构建、不写 dist、不部署。输出在本目录 `checks/<label>/`：setup、五份原始结果、partial、source-before/after 与 verification。若浏览器/Worker异常，保留已得到的用例、阶段和取消位置。

Vite 的当前依赖加载方式和脚本本身尚未在运行环境验证；若首轮出现模块解析、类型或测量机制错误，应保留首轮失败后最小修复，不能把机制错误当性能通过。最终仍需产品进度/取消与已有锁浏览器流程的独立验收。
