# 追加大陆、细场锁与真实坡向：证据归档准备

本文件只列来源、取舍与待收录条件，不是正式核验报告或任务状态更新。未执行归档、检查、构建或测试，未修改生产与正式文档。以下路径均相对项目根目录；本次只查看列明目录及现有清单，没有递归重扫工程。

## 本批来源索引

| 范围 | 已有原始来源 | 最小保留集合及含义 |
| --- | --- | --- |
| 实际提升 | `.autopilot/ph06/additive-promotion.json` | 原样保留；记录每个目标的 baseline、expected、promoted SHA。各 staging 的 `productionPromoted:false` 是当时记录，不应改写，当前提升事实以此独立记录与最终检查快照为准。 |
| 追加大陆内核 | `.autopilot/ph06/v4-additive-staging/checks/` | `verification.json`；`tests-first.{json,log}`、`tests-first-exit.json`；`tests-repair1.{json,log}`、`tests-repair1-exit.json`；`lint-first.log`、`lint-first-exit.json`；`types-first.log`、`types-first-exit.json`。首轮 resolver 路径失败实际执行 0 项，不能记作测试通过；修复 resolver 后原 8 项通过。共享锁 guard 闭包后来更新，这 8 项是历史定向证据，当前 kernel 必须由主执行者提升后的定向选集证明。 |
| 追加 recipe / session / history / UI 接线 | `.autopilot/ph06/v4-additive-integration-staging/` | 根部 `baseline-manifest.json`、`ready-manifest.json`；`checks/verification.json`、`checks/candidate-fingerprints.json`、`checks/tests-first.{json,log}` 与对应 `tests-first-exit.json`；`checks/lint-first.log` 与 exit JSON；`checks/types-first.log` 与 exit JSON；`checks/types-repair1.log`、`checks/lint-repair1.log` 及各自 exit JSON。6 项首次单元通过；首次 TS2322 recipe 联合类型错误及真实分支修复保留。candidate-fingerprints 是 overlay 闭包计算，不是实际构建指纹。 |
| 细场锁 / 全替换 / 存储最终保护 | `.autopilot/ph06/v4-lock-staging/` | `baseline-hashes.json`、`ready-manifest.json`、`static-first.json`；`checks/first/{command.json,results.json,run.log,source-before.json,source-after.json,verification.json}`。原定向 16 项首次通过、7,768.0059 ms；原始前后快照需保留可复查。这轮和提升后再跑的同名用例不能重复计唯一数。 |
| 真实坡向 shader CPU / 静态 | `.autopilot/ph06/v4-relief-staging/` | `baseline-hashes.json`、`ready-manifest.json`、`first-unit.{json,log}`、`first-verification.json`、`types-recheck.json`、`inventory.json`；复现用 `check.mjs`、`types-recheck.mjs`、`vitest.config.ts`。14 项单元包含原 8 项加新 6 项；首次隔离 types 漏 `vite-env.d.ts` 的 7 条声明错误仍在 `first-verification.json`，只修检查环境后 types 通过，不重复单元。 |
| 坡向实际 WebGL2 / Pixi RT | `.autopilot/ph06/v4-relief-staging/gpu/` | `summary.json`、`first-run.log`、`first/{before.json,verification.json,full.json,supplement.json,relief.json,full.png,supplement.png,relief.png}`；复现用 `harness.ts`、`harness.html`、`run.mjs`、`summarize.mjs`。原 625/55,330 与补充 103 个诊断探针均保留；新增 25 个 raw GPU 色彩与 4 个 Pixi RT 色彩对照。实际 SwiftShader，不是硬件或性能证明。 |
| 本批浏览器脚本来源 | `.autopilot/ph06/v4-additive-integration-staging/browser/` | `ready-manifest.json`、`README.md`；脚本镜像 `atlas-add-detail-coast.spec.ts` 可由最终 Git 对象与 SHA 绑定而不另复制正文。这里的 ready 明确 `actualBrowserRuns:0`，只有 syntax parse，不能冒充后续实际浏览器结果。 |
| 提升后的最终组合验证 | `.autopilot/ph06/additive-checks/` | 已确认入口 `run.mjs`。每个实际结束运行目录收录 `scope.json`、`source-before.json`、`source-after.json`、`verification.json`、真实 `unit.json`、已执行各项 `*.log`、成功构建时的 `build.json`。以 `verification.results[].args/exitCode/signal` 和 raw unit 为准；失败中止后没有产出的检查仍是未执行，不能按脚本计划填 PASS。浏览器 runner 的实际位置由主执行者完成后给出，当前不猜造目录或结果。 |

空日志本身不证明成功；必须保留对应 exit JSON 或明确记录退出码的 verification。source-before/source-after 只有哈希清单，不能写成完整源码快照。

## 可直接引用的既有正式归档

1. `docs/evidence/ph06-fine-coast-2026-09-27/detail-shader-checks/` 已保存固定 light=1 shader 的完整 625 集、103 个补充探针、harness、日志、截图及 verification。本批只引用其相对路径和文件 SHA，不复制整个旧目录。旧 shader 通过不能替代新坡向 shader 的实测。
2. `docs/evidence/ph06-fine-integration-2026-09-27/` 已保存前批 839 项、backend 4 项窄复查、桌面负坐标首次失败与三端 reframe 后实际通过。只引用其 `verification.json`、`inventory.json` 和适用的原始条目，不重复复制巨大 first trace。复用范围必须写清“不受本批源码影响”；不能将前批浏览器通过记成本批追加流程通过。
3. `docs/evidence/ph06-preview7-generator-history-2026-09-27/` 已实际存在 `build.json`、`provenance.json`、`frozen-source/`。这是 7 个 preview.7 runtime 闭包与 27 源文件的正式历史依据，直接引用这个目录；不再复制 `.autopilot/ph06/v4-additive-integration-staging/evidence/preview7/` 的第二套。保留历史源码与原哈希不改，尤其不能拿新闭包覆盖旧 recipe 身份。
4. 对这些已归档引用，清单记录 `path`、`sha256`、所在本地 Git 提交及用途。只写 ignored `.autopilot` 路径不足以构成长期可复查证明，必须有正式归档文件或可检出的 Git blob。

## 新 GPU 大文件的无损归档建议

新坡向 shader 的 `gpu/first/full.json` 与旧固定光照的 `gpu-first.json` 不是同一个运行，不能用“625 已有”删掉新的完整原始证明。它们诊断目标相同，但 shader 来源、运行时间、console、GPU 结果绑定不同。

最小方式是在新归档中只存一份 **新 full.json 的原字节 gzip**，其余小 JSON/日志/PNG 直接保存。既有未压缩原件继续留在 ignored staging，不移动或覆盖。压缩后必须在内存完整解压，验证原字节长度和 SHA；不能以 JSON parse/stringify 重新序列化后冒称同一原始文件。index 要明确 encoding、压缩文件 SHA、原始 SHA、原始长度及原始来源路径。审阅者据此可以完整恢复 625 个模式和每个探针。

现成 `v4-relief-staging/inventory.json` 给出的原始条目如下，无需再次查找：

| 原始文件（相对 v4-relief-staging） | 字节数 | SHA-256 |
| --- | ---: | --- |
| `gpu/first/full.json` | 8,479,493 | `ebaa25efe8817be21ffab343862c1c1eeae5aa1609a50f9951262c4c56122cfd` |
| `gpu/first/supplement.json` | 45,666 | `49152d201da07487b494a3a1f0f76d3c615e7a093afbe88bb919761233ed3bf1` |
| `gpu/first/relief.json` | 54,268 | `4f8cca75ef05044503d5488595fe11ce2bc33cabfbc169bcc759882da82c0870` |
| `gpu/first/verification.json` | 13,647 | `fc0a9a5049debbf3eeb200ae271bff46169678eec280b201dc0e83be376b17d1` |
| `gpu/summary.json` | 5,740 | `7de178dd3ce9c7b35d256c6ef275c83be5560b9774afd73ccdafd96a2680507b` |

实际 fragment SHA 为 `0466427b79021ac66b6d023360af8ed7976fca790f12bad4e84a106801fb941e`；版本 `final-q8-pieces-gl2-relief-v1` 在浏览器内先断言，防止 alias 误指向生产旧 shader。最大高度误差、实际颜色字节、保留的 readPixels stall 警告均在新 raw 中，不应仅保留摘要。此次 GPU 首次通过，没有 GPU 修复轮；不能虚构一个失败。

如果不采用 gzip，原样保存新 8.48 MB JSON 也可；应二选一，不能同时提交 gzip、未压缩 JSON 和整目录 ZIP 三份。旧 8.48 MB 集只引用正式归档。PNG 已压缩，trace.zip 已打包，通常不再嵌套压缩。

## 其他去重与复查约定

- **生产源码镜像**：不要归档所有 `staging/src`。已有 `additive-promotion.json`、baseline/ready 清单和最终本地提交可定位源文件。最终提交中的 Git blob 可重现被检查版本时，记 `commit:path` 与 SHA 即可。首次失败涉及后来改变的文件若 Git 中不可检出，则保存那一版最小文件/补丁，不用复制整个工程。
- **前后哈希清单**：原始 bytes 完全相同的快照允许按 SHA 只存一份，索引中分别保留 before/after 的原路径、角色和哈希，不能省略其中一个发生时点。若采用简单原样复制，这些清单只有数十 KB，优先可读性即可；不要为这点容量引入复杂还原依赖。
- **实际检查总数**：以本批 root raw unit 的 test identity 计算唯一数、执行数和重复数。staging kernel 8、integration 6、lock 16、shader 14 与最终受影响选集会重叠，不直接相加。GPU full 与 supplement 本身各带 Pixi 诊断，relief 又带 81 次重复诊断，记录它们是执行数而非新增场景。
- **复現入口**：保留本批原始 runner/config/harness 文本及 SHA。GPU harness 通过独立 `configFile:false` Vite alias 加载镜像；归档后路径不同不应悄悄改写原脚本。另写运行位置说明或小型重建映射，旧源码仍由 Git/正式历史归档取回。
- **最后的 build 绑定**：最终归档纳入实际 `build.json`、实际构建产物数量和逐项 SHA，源码前后检查必须对应最终生产版本。overlay 指纹、旧 preview.7 构建、单次 staging 单元均不能代替新产物。编译后的 `dist/assets` 正文不放证据包。

## 归档排除项与收录时点

严格排除 `node_modules`、所有 `vite-cache` / `.vite`、缓存、编译输出、开发服务文件、认证内容、真实用户存档，以及 `.playwright-artifacts-*` 等隐藏运行中片段。不得递归复制整个 `.autopilot/ph06`。正式 `trace.zip` 作为原始测试证明保留，不能因里面含浏览器资源而拆坏；不得另外展开复制其中数百张 JPEG。

只在 runner 已写出 `results.json`、结束 verification、after 快照和退出信息后收录。保留首轮与每个失败修复轮，最终报告取最新完成轮，不挑旧 PASS 覆盖新 FAIL。归档目录如果已存在要拒绝覆盖；这份准备表不执行该操作，也不预填尚未产生的 root 静态、构建或浏览器结果。
