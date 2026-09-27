# PH06 第三版权威裁切海岸：实现与验收记录

日期：2026-09-27
状态：**本批技术核验已取得组合通过证据；保留首轮失败。浏览器 18 个唯一场景经两轮共 24 次执行获得通过证据，生产构建通过。自然大陆视觉、真机及七项性能/取消场景未通过，PH06 不结项。**
执行范围：本地开发与本地检查；本记录不授权或声称新增 GitHub/Cloudflare 发布。

## 本批解决的问题

用户要求普通放大视图具有自然海陆边界，且手绘结果、点击判定、面积和保存后的地图一致。上一批连续地形着色仍沿完整四边形区分海陆，不能消除近景阶梯海岸。本批引入显式的第三版草稿解释，将真实海岸放入四边形内部，不使用只供显示的样条遮盖旧整格边界。

实现约定见 [ADR 0015](../adr/0015-authoritative-coastal-surface.md)。本记录的源码说明与定向测试结果是不同证据层；完整构建、浏览器、视觉和真机结果在相应门实际完成之前均不自动通过。

已归档的本批汇总为 [verification.json](ph06-coastal-surface-2026-09-27/verification.json)，目录同时保留原始首次/复查 JSON、完整源文件及 dist 清单、六张实际截图与 [实际应用内浏览器观察](ph06-coastal-surface-2026-09-27/local-playtest-observation.json)。以下保留首次错误与修复事实，不将组合证据改写为首轮全绿。

## 实现范围

### 显式 v3 与独立保存空间

- 新草稿合同为 `version:3`、`surface:{kind:'land-mask-fan-v1',coordinateScale:256}`，存储域 `atlas-draft-v3`，独立 IndexedDB 库 `lieguoji-atlas-drafts-v3`。
- 新建入口选择第三版；底层旧默认创建行为保留 v2 兼容。旧 v1/v2 通过明确的独立副本进入新解释，不原位改版本、覆盖原库或改写原草稿/备份。
- 副本记录来源格式、草稿身份、读取时点、源 manifest 与观察到的根摘要，使用新的草稿身份和独立根。旧链接仍打开旧解释。
- `surface` 参与 manifest 身份。普通编辑、纯锁事务和完整替换不能悄悄替换地表合同；未知或未来合同继续锁写。
- 原 LGAB 几何/高程/归属块及 LGAL 锁编码继续使用。派生海岸片不另存为第二套可失配地图；恢复后从相同合同与源块重建。

主要文件：`generation-contract.ts`、`generation-format.ts`、`atlas-format.ts`、`generation-locks.ts`、`transactions.ts`、`storage.ts`、`storage-types.ts`、Worker/bridge 与创世入口。

### 权威海岸、拾取和面积

- `coastal-surface.ts` 从每个真实 quad 的量化面积重心与四个共享角点建立三角扇。中心覆盖值由该格真实高程符号决定（陆地 `+256`、海水 `-256`）；共享角点覆盖值来自实际 incident cells 的符号均值。
- 每个扇片按覆盖值零线裁切，输出真实陆地/海水三角片及岸段。同一地块可以同时包含陆地与海水。显示、位置拾取的海陆/高度、地表面积使用同一份裁切定义。
- 角点高程只由对应海陆类别的邻格样本按真实重心距离加权；中心保持原高程，岸线高程为零。只改变山高或海深而不改变符号/几何，不移动岸线。
- 为精确表达二分和三分交点，内核坐标使用源 Q8 的六倍（1536 单位/世界单位，字段名 `xQ6/yQ6`）。逐三角片进行精确面积守恒检查，拒绝退化、反向或不合法几何。
- 零边界按陆地拾取，共享零边由稳定 owner 避免重复绘制；世界边框不自动当海岸。点接触不冒充正面积连通。
- 生成摘要保留历史的“两倍实际面积 ×256²”单位。v3 累计精确 `landAreaTwiceQ6/totalAreaTwiceQ6` 后除以 **36**；内核普通 `areaQ2` 字段除以 **72**，两者不能混用。v2 继续按完整格面积统计。
- 原 `majorComponentCount` 仍来自中心 mask 四邻接 BFS，第三版显示为“陆地采样连通区”；未将它改称实际裁切大陆拓扑数量。

### 生成范围、锁和失败保护

`coastal-generation.ts` 在真实生成算法结束后、候选哈希与替换准备前，按 128 个实际地块分批核验裁切面积、保护和局部范围，并报告进度、检查取消。

- 海岸锁保护实际海陆片/岸线坐标，高程锁还保护裁切地表高度，包含邻格符号、邻格幅度和间接重心变化的影响。
- 高程变化展开 3×3 依赖邻域，顶点变化从其 incident cells 展开邻域；最终存储边界复用相同片几何/高度比较语义。
- 局部生成不得通过共享角点改变选区外派生海岸。只检查范围外源格数值不变不足以通过此门。
- 发现越界或保护冲突时拒绝整份候选，不偷偷恢复若干地块或修改锁。取消、拒绝和未确认预览保持源会话/持久根不变。
- 原手绘、海床、山系等生成算法仍输出真实可编辑高程块；没有以新增显示颜色代替它们。执行指纹对应实际源码闭包；历史指纹仅用于恢复旧配方。

## 实际定向验证

以下为已完成的独立定向运行，不是统一构建或浏览器结果。

| 范围 | 实际结果 | 证据及说明 |
| --- | --- | --- |
| `coastal-generation.test.ts` + `coastal-generation-session.test.ts` 首轮 | **8/14 通过，6 失败**；8.98 秒 | `.autopilot/ph06/coastal-generation-checks/unit-first.log`；失败原文保留 |
| 上述两文件修正夹具后 | **14/14 通过**；11.61 秒 | `.autopilot/ph06/coastal-generation-checks/unit-second.log` |
| 上述两测试、`coastal-generation.ts`、`generation-session.ts` owned lint | **通过，exit 0** | `.autopilot/ph06/coastal-generation-checks/owned-lint-first.log`、`owned-lint-final.log` |
| 海岸内核、连续地表及几何缓存定向集合 | **31/31 通过，3 文件**；1.01 秒 | 执行者工具输出，12:40:34；`coastal-surface.test.ts`、`terrain-surface.test.ts`、`atlas-terrain-geometry-cache.test.ts`；未另存独立日志 |
| `renderer.test.ts` 的 `renders v3 clipped coast pieces` 定向用例 | **1/1 通过**，其余 74 项未选中；6.29 秒 | 执行者工具输出，12:41:45；不是 renderer 全套通过 |
| 内核补零覆盖 junction 用例后的定向重跑 | **11/11 通过**；691 毫秒 | 执行者工具输出，12:42:50；包含前述 31 项中的重复覆盖，不能合计为 42 个不同测试 |
| `renderer.test.ts` 的 `rejects same-draft version or surface changes` 定向用例 | **1/1 通过**，其余 75 项未选中；6.51 秒 | 执行者工具输出，12:47:26；验证同身份版本/合同变化拒绝 |
| 内核/渲染执行者负责的 7 文件 lint | **通过，exit 0** | 执行者工具输出，无独立日志；上述独立执行均无失败重试 |
| 格式/存储执行者的四文件首轮 | **42/44 通过，2 失败**；23.77 秒 | 执行者工具 session 91599；`surface-format-storage`、`generation-format`、`generation-storage`、`constraints-storage`；一个旧拒绝文案断言失配，一个新增锁夹具未真正改变岸线；无独立日志文件 |
| 格式/存储受影响两文件复查 | **25/25 通过，23.63 秒**；最终收紧未知 surface 断言后再次 **25/25 通过，22.17 秒** | 执行者工具 session 54587、24402；另两文件首轮已通过的 19 项证据复用，44 个唯一场景均有通过结果，不合计重复运行次数 |
| 格式/存储执行者类型检查与 owned lint | **通过** | 执行者完成记录；全工程类型检查一次、本人改动文件定向 lint；不替代冻结后的统一门 |

生成校验两文件首轮六项失败及处理：

1. 五个 helper 用例向夹具增加了锁块，却没有同步 manifest 的真实 `lockRefs`，正式 clone 入口因此正确拒绝非法封套，未执行到期望的保护/取消断言。修正夹具，增加真实 LGAL 哈希和引用；没有放宽正式封套检查。
2. 实际手绘锁保护用例最初只画一个新格，触发既有“孤立微小噪声片清除”，在进入 v3 海岸保护前就因无新增陆地拒绝。夹具改为 3×3 新岛屿，最近格仍与旧锁定陆地对角相邻，保留必须由海岸锁拒绝的断言；没有改变生成器消除阈值。

格式/存储的独立首轮另外两项失败也保留：旧拒绝文案断言与当前语义不符，修为准确错误断言；新增岸锁样本未真正触及裁切岸线，修为实际影响岸线的邻接样本。最终未知 surface 断言明确要求未来格式保护。没有通过删除检查或放宽锁规则取得通过。该执行者新增的 `surface-format-storage.test.ts` 含 10 项 v3 合同、实际 IndexedDB 接口、备份、CAS、跨块锁与 delta 用例；独立日志路径未提供时只标执行者记录，不伪造可追溯文件。

十四项通过的具体范围包括：可解析单格岛屿面积恰为原格的 4/9、全世界面积单位一致、对角 sign 改变的海岸锁、同号幅度改变的高程锁、非 incident 顶点改变邻格重心所造成的间接高度保护、范围外派生海岸保护、依赖扫描与面积扫描取消、忽略无物理意义的 anchor 身份，以及真实手绘预览/确认/独立 v3 IndexedDB 保存恢复、v2 整格摘要兼容、真实局部山系与海床岸线不变、真实手绘锁冲突拒绝、生成后 v3 面积阶段取消原像保留。

这些用例使用真实生成器和真实会话/存储实现。IndexedDB 集成使用 `fake-indexeddb`，不冒充浏览器持久化或真机测试。

## 冻结后的统一检查与保留失败

主执行者先执行 `.autopilot/ph06/coastal-checks/run.mjs first`。`first/build.log` 记录全量单元 **1210/1211 通过、67 文件、406.75 秒**，唯一失败位于 `atlas.worker.test.ts:663`：旧用例期待提示包含“第二版”，当前准确提示为“请先打开可编辑的创世草稿。”。因此首轮 `build:cf` **exit 1**，其 runner 没有启动浏览器；不将首轮记为整套通过。

修复只把该文案断言改成完整准确提示，无写入、只读状态和旧库保护断言全部保留。`wording-recheck/first-run-reuse.json` 对照首轮冻结清单确认产品源码字节完全一致，变化只有这一行测试以及新增 `repair.mjs` 工具。首轮已通过的计划检查、22 项 release 测试及其余 1210 个单元保留复用。

修复 runner 的首次 shell `-t` 引号解析错误，实际 **3 文件、70 测试全部未选中**；`wording-recheck/build.log` 中该步骤虽未返回失败，但没有执行目标场景，**不能算复查通过**。主执行者随后直接用 Node 启动 Vitest 并传入正确参数，重新执行原失败完整场景，实际 **1 项通过、47 项未选中，6.01 秒、exit 0**，见 `.autopilot/ph06/coastal-checks/unit-wording-real.log`。由首轮 1210 项和真实定向复查 1 项获得 1211 个唯一场景的通过证据，不声称另跑了一次全量 1211 项。

修复后重新执行全局 lint、类型检查和真实生产构建，均通过；产物检查确认 **25 个允许发布的游戏产物**。完成浏览器脚本两处修复后，最后全局 lint 与类型检查再次通过。这没有删除检查、跳过原失败场景或改变产品逻辑；真实统计与复用边界收录于归档汇总。

| 门 | 最终记录 | 实际归档证据 |
| --- | --- | --- |
| 首轮统一检查 | **保留失败：1210/1211，exit 1** | 汇总 `units.first`、`unit-first-build-execution.json`、`unit-first-failure.json`；计划与 22 项 release 通过证据复用 |
| 原失败完整场景修复复查 | **1/1 通过；47 项未选中** | 汇总 `units.actualRecheck` 与原始 `unit-wording-real.log`；无目标被选中的首次 repair 步骤不计通过 |
| 修复后的全局 lint、类型检查、生产构建与 dist 审查 | **通过；25 产物** | 汇总 `productionBuild`、`browser-first-build-execution.json`、原始 `wording-recheck/build.log`；产品源码与首次冻结字节一致 |
| 本地预览提供本次 `dist/build.json` | **两轮浏览器前后均一致** | `browser-first-http-before/after.json`、`browser-recheck-http-before/after.json`；HTTP 实际响应与 dist 一致 |
| 首次 18 个三端浏览器场景（桌面/移动/平板仿真各 6） | **12 通过、6 失败，exit 1**；671,209.222 毫秒 | `browser-first-results.json`、`browser-first-verification.json`；18 项覆盖完整，0 retries / skipped / flaky；不把首次记录改成通过 |
| 首次浏览器源文件集合/内容与 dist 集合/内容前后一致 | **通过；249 个源文件、25 个 dist 产物稳定** | `browser-first-source-before/after-*.json`、`browser-first-dist-before/after.json`；`sourceStable:true`、`distStable:true` |
| 六个 entry/copy 完整场景定向复查 | **6/6 通过，exit 0**；61,179.141 毫秒，0 retry | `browser-recheck-results.json`、`browser-recheck-verification.json`、`browser-recheck-selection.json`；桌面/移动/平板各 2 |
| 两轮产品与产物是否一致 | **全部产品源码、25 个 dist 产物相同** | `browser-recheck-scope-reuse.json`、两轮源文件及 dist 前后清单，汇总 `sourceProductUnchanged:true`、`distUnchanged:true`；仅入口/copy 两处测试脚本修复 |
| 当前本地构建身份 | **已核两轮实际响应** | 归档 `build.json`；版本 `0.5.0-preview.5`，构建记录基准提交 `17f9f333b964674f84e66a68ac09003c81d93e14` 加冻结工作区；`build.json` SHA-256 `0ea1d390111d836e99ab639961c5c8bb30f39b198869dddbd9cfb89449465bf8`；随后游戏代码本地提交为 `08a69c23795727dc520885d824426c50d03c7e99`，不改写历史构建元数据，未推送 |

表中归档文件均位于 `docs/evidence/ph06-coastal-surface-2026-09-27/`；原始日志仍按汇总 JSON 内的 `.autopilot/ph06/coastal-checks/` 路径保留。

首次浏览器已完成，12 项通过包括三端实际 v3 海陆分片、旧 v2 两项手绘回归和旧 v1 GPU 双恢复场景；桌面 `[coastal-v3]` 耗时 41.7 秒。六项失败全部来自同两种测试问题在三端各出现一次：`[coastal-entry]` 没有先打开旧工坊“世界”工具就寻找隐藏入口；`[coastal-copy]` 文案断言期待“海陆面积会变化”，实际确认框为“沿岸地块的陆海面积会变化；原草稿不会改写。”，正式的面积变化与原档保护提示实际存在。完整首轮错误上下文保留在 `wording-recheck/test-results` 中对应 entry/copy 用例的 `error-context.md`。

首次冻结执行结束后，主执行者仅修改 `tests/atlas-coastal-surface.spec.ts` 两处：entry 先打开“世界”面板，copy 匹配实际完整提示。产品源码与 dist 不变。随后 `browser-recheck.mjs entry-copy-recheck` 在三端各执行完整 entry/copy 两项，共 **6/6 通过，exit 0，61,179.141 毫秒，0 retry**；完整身份、独立保存、刷新及原库保护断言保留。

组合结论为 **18 个唯一场景获得通过证据，实际执行 24 次**：首次 12 项通过的证据复用，修复复查六项全部通过。不能称为首轮 18/18，也不能把 24 次执行说成 24 个不同测试。首次 12/18 及六项失败仍原样归档。

18 场景的有界选集为：三个新增 v3 实际海陆片/入口/显式旧档副本场景，两个旧 v2 手绘回归场景，一个旧 v1 GPU 双恢复场景，分别在三种 Chromium 屏幕/输入配置运行。`workers:1`、`retries:0`。本选集不包含延期的 PH06-T4 性能/取消预算套件。

六张实际图像已归档，可分别查看 [桌面全景](ph06-coastal-surface-2026-09-27/desktop-world.png)、[桌面近景](ph06-coastal-surface-2026-09-27/desktop-shore.png)、[移动全景](ph06-coastal-surface-2026-09-27/mobile-world.png)、[移动近景](ph06-coastal-surface-2026-09-27/mobile-shore.png)、[平板全景](ph06-coastal-surface-2026-09-27/tablet-world.png)、[平板近景](ph06-coastal-surface-2026-09-27/tablet-shore.png)。这些是浏览器模拟图像证据，不是真设备或用户视觉验收。

## 实际应用内浏览器操作与视觉观察

以下为主执行者在真实应用内浏览器中的直接操作记录，已归档于 [local-playtest-observation.json](ph06-coastal-surface-2026-09-27/local-playtest-observation.json)，区别于上文自动化测试和三端模拟。已有演示 v2 草稿当时为 revision 3；经明确确认创建独立 v3 副本后，新副本为 revision 0，刷新后再次恢复为 revision 0。实际本地链接为：

`http://127.0.0.1:4173/?atlas=atlas-5fa3eb44-f9e4-461f-9297-30fab36fa12a&atlas-format=3`

本次所读控制台错误列表为 `[]`。该链接是当前机器上的本地预览和本地保存身份，不是新的公开部署地址，也不是跨设备同步存档。此操作只记实际 UI 冒烟观察，持久数据的原库隔离由上文独立浏览器测试验证。

主执行者已看应用内浏览器 14% 全景、32% 视图和测试产生的 527% 近景。岸线已不再完全沿整格边缘，但仍有直线折角，原采样密度限制仍可见。**自然大陆视觉不记 PASS**，不因完成这次副本/刷新操作而给出用户视觉验收结论；本次观察也不等于真手机或真平板检查。

主执行者又实际查看归档的 `mobile-world.png` 与 `tablet-shore.png`：手机布局图未见横向溢出；平板近景仍有直线长岸段/折角，并展示采样中心编号。这些编号不是城市或国家实体，不能据此宣称城市/国家层或用户要求的自然地图视觉已完成。

## 非目标、尚待验收与 PH 状态

- 本批提高海岸几何表达能力，没有增加高程采样密度，没有实现任意精细多尺度海湾/岬角生成、全新岛链算法、海浪/潮汐/流体模拟或自由样条海岸。原数据仍有采样分辨率限制，裁切后的岸线仍为确定的线段。
- 自然大陆、半岛、不同尺度海湾与岛链的整体视觉是否达到用户要求，必须由实际普通视图/近景截图和用户验收确认。新内核正确或局部测试通过不能替代这一结果。
- 浏览器三端仿真不是真手机或真平板；真实设备和用户视觉验收保留待验收，不将它们分摊为每个纯数据单测的阻塞理由。
- 本次分批取消单测只证明取消语义，未证明首条/连续进度 **250 毫秒**、取消 **500 毫秒**预算。此前 PH06-T4 的 7 场景有界套件因视觉优先暂停，未执行；局部 UI、区域锁、过渡带、刷新及 256/512 运行时性能证据仍须主线补齐。
- 不将新海深颜色或岸线解释记为河网、气候、资源生态完成。PH07 仍依赖 PH06；国家行政、家族、信仰等后续阶段也不由此次几何改动自动完成。
- 本批记录对应 `plan/tasks.json` 为：PH06 **in_progress**，T1/T2 **done**，T3/T4 **in_progress**；PH07 **todo**。本文件不改计划状态，不宣布 PH06 完成，也不更新 `AUTO_HANDOFF.md`。
- 所有发布门保持现行授权边界。本地构建与预览检查不代表新增线上地址、远端 CI 通过或自动生产发布。
