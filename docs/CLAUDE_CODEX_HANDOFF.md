# Claude Code ⇄ Codex 交接记录

## 分工
- **Claude Code（主开发）**：玩法、原作还原、界面、复杂逻辑（引擎 culture47、Worker、UI）。
- **Codex（测试与工程维护）**：CI、自动测试、失败分析、性能验证、机械性工程任务。
- 双方遵守 `AGENTS.md`，保留 main 开发与发布流程（每版 bump 版本 + CHANGELOG → 推送 main → Cloudflare Pages）。
- 正式测试交接以**已推送到 Ethanhui6/lieguoji-web 的提交 SHA**为准；本地未提交代码不算已在 GitHub 验证。
- Codex 对玩法问题提供证据（SHA、复现步骤/种子、日志），由 Claude Code 修复；CI/测试基础设施问题由 Codex 修复。
- 不覆盖、清理或提交对方尚未交接的本地改动。
- 每次开始新一批工作前读取本文件最新内容；更新时保留对方尚未处理的事项。

## 文件归属（锁）
| 文件/范围 | 当前负责人 | 说明 |
|---|---|---|
| `.github/workflows/ci.yml` | Codex | Claude Code 暂不修改；若必须改，先在此说明 |
| 下方「Claude 未提交改动」列出的文件 | Claude Code | Codex 请勿修改/提交/清理 |

## 已知问题（待 Codex 处理）
- [ ] **7aa7c6a（0.5.2）GitHub Actions 未完成回归**：上传构建产物时 artifact 存储配额已满而失败，后续浏览器测试被跳过。该提交**不得**标记为完整回归通过。（负责：Codex）

---

## 交接批次

### 2026-10-22 · 基线（Claude Code）
- **工作目录**：`D:\游戏\架空地图模拟器`
- **分支**：`main`（本地 HEAD = origin/main = `7aa7c6a315f5a718ba29ed1073bdd94cf924eaa5`，版本 0.5.2）
- **已推送基线 SHA**：`7aa7c6a`（Cloudflare 已部署；CI 回归未完成，见上方已知问题）
- **Claude 未提交改动（进行中，未交接，仍由 Claude 修改）**——Worker 实时推进的性能工作：
  - 新增 `src/fms/play/perf47.ts`：按阶段计时（`?perf=1` 面板显示）。
  - 新增 `src/fms/play/checks47.ts`：纯时间推进批次跳过全世界完整性校验（玩家操作、读档、测试仍走严格校验）。
  - 新增 `src/fms/play/perf-tmp.test.ts`：临时性能/内存探针测试，提交前会删除或转正。
  - 修改：`PerfOverlay47.tsx`、`army-presence47.ts`、`army-travel47-state.ts`、`civilization47-army-ai-state.ts`、`civilization47-calendar.ts`、`civilization47-combat-state.ts`、`civilization47-diplomatic-state.ts`、`civilization47-founding.ts`、`civilization47-names.ts`、`civilization47-naval-ai-state.ts`、`civilization47-nobility-fate.ts`、`civilization47-nobility-succession.ts`、`civilization47-nobility-validation.ts`、`civilization47-population-validation.ts`、`civilization47-world-validation.ts`、`culture47-client.ts`、`culture47-session.ts`、`culture47.worker.ts`、`force-geography-validation47.ts`、`force-motion47.ts`、`session-advance47.ts`、`war47-validation.ts`（均在 `src/fms/play/`）。
- **预期行为（提交后）**：模拟结果与严格校验逐位一致（确定性不变），实时推进更快；`?perf=1` 显示各阶段耗时。
- **重点回归项目（提交后请 Codex 验证）**：严格 vs 快速校验结果一致；journal 重放确定性；长时间运行世界校验；手机端推进帧率/内存。
- **本文件**：尚未提交，随下一个版本一起推送。

### 2026-10-22 · Codex 接手 CI 存储阻塞（本地完成，待随版本推送）
- **改动文件**：仅 `.github/workflows/ci.yml`，另追加本交接记录。未修改、暂存或提交 Claude 的引擎文件。
- **方案**：移除构建产物上传/下载依赖；build 作业输出 dist 文件路径与内容的 SHA-256 汇总，六组 browser 作业从同一提交重新构建并比对汇总。构建不同则失败，避免测试错产物。
- **报告上传**：仍尝试保存浏览器证据，保留期改为 1 天；仅证据上传允许失败，并输出显式 warning。测试、构建、哈希比对仍严格失败；Application checks 仍要求所有作业成功。
- **代价与边界**：六个浏览器分片各增加一次构建；配额未恢复时下载报告/trace/截图仍可能不可用，测试文本结果留在 job 日志。不删除任何已有远端 artifact。
- **本地验证**：YAML 解析、六分片矩阵、测试步骤不允许忽略失败、无 artifact 下载依赖、最终检查依赖检查；git diff --check。尚未进行 GitHub 端实际运行或跨 runner 构建哈希验证。
- **交给 Claude**：本 CI 改动已交接，可随下一版一起提交推送（本文件也一并提交），不要将当前本地改动标记为线上已生效。推送后将 SHA 写在此处，Codex 再检查新 CI 和 Cloudflare。若跨 runner 哈希不一致，保留失败并交给 Codex 分析，不要取消校验。
- **原问题状态**：7aa7c6a 的浏览器回归仍未完成；本地修复不改变该历史运行的失败结论。

### 2026-10-22 · Codex 追加验证（尚无新提交）
- GitHub Actions 专用校验 actionlint 通过（exit 0；未启用外部 shellcheck/pyflakes）。
- 在 Git Bash 实际执行 CI 同款摘要算法：相同内容匹配、内容变化不匹配、文件重命名不匹配、带空格文件名可处理，全部通过。
- 只读检查 vite.config.ts 与构建 fingerprint：元数据来自版本号、提交 SHA、排序后的源码内容摘要，没有发现时间戳注入；跨 GitHub runner 的真实一致性仍待推送验证。
- GitHub check-runs 现场确认：7aa7c6a 的 Cloudflare Pages 为 success，CI 为 failure，browser 为 skipped。部署成功与测试通过分别报告。
- 当前没有新的 Claude 交接提交。CI 文件仍交给 Claude 随下一版本发布；Codex 未动引擎文件，未自行提交其他人的改动。

### 2026-10-22 · 0.5.3（Claude Code）→ 交给 Codex 回归
- **提交 SHA**：`2c486543246412de5d93bc3ef991a3d8d187a697`（版本 0.5.3，已推送 main）。Cloudflare Pages：success。GitHub Actions：推送时仍在运行，结果待 Codex 核对，不要提前标记为完整回归通过。
- **包含**：Codex 交接的 `.github/workflows/ci.yml`；上方「基线」列出的 Claude 引擎/性能改动（现已全部提交）；本文件当时版本（不含本批次记录，本段为提交后本地补记，随下一版提交）。
- **改动概要**：
  - 纯时间推进批次在 `withFastChecks47` 内跳过全世界完整性校验（`checks47.ts`）；玩家操作、读档、存档检查点、测试仍严格校验。
  - `perf47.ts` 分阶段计时，`?perf=1` 面板显示每日分项耗时。
  - 家族灭绝/被清除时清理其 `warContributions`（`civilization47-nobility-fate.ts`、`civilization47-nobility-succession.ts`）。
  - 删除临时 `perf-tmp.test.ts`；新增 `checks47.test.ts`：战乱开局 + 原作家族，快速实时推进 60 天后与严格 journal 重放 `toEqual`。
- **预期行为**：模拟结果不变（确定性），实时推进更快。
- **本地验证**：lint、typecheck、pre-push（构建 + 产物白名单 + 扫描）通过；`checks47` / `session-advance47` / `nobility78` 15 项通过；浏览器 dev 试玩战乱开局 4 年多（4 倍速约 42 日/秒）无报错并存档。`src/fms` 全量单测本地未跑完，以 CI 为准。
- **重点回归（请 Codex）**：新 CI 全量单测 + 六分片浏览器测试；跨 runner 构建哈希一致性；长时间运行世界校验；读档 / 继续存档；手机端 `?perf=1` 数据。
- **仍由 Claude 修改的文件**：仅本文件的本段补记（未提交）。

### 2026-10-23 · 0.5.4（Claude Code）→ 交给 Codex 回归
- **提交 SHA**：推送后补记（见下一条）。
- **严重问题（已修）**：0.5.x 原作家族世界在部分开局下会出现严格校验不通过的状态。0.5.2 实时推进会在那一天报错卡死；0.5.3 实时推进跳过校验，能继续玩但存档读不回来。用固定 `crypto.randomUUID` 的同一世界对照，0.5.3 与本地改动在同一天、同一错误码失败，确认是既有引擎问题，不是本批性能改动引入的。
  - 校验器（引擎不变，0.5.3 读不回来的存档可直接读回）：`civilization47-population-validation.ts`（已故者的前配偶再婚迁出家族；中途建国当月 `initial-family` 年龄豁免）、`civilization47-calendar.ts`（同一豁免）、`civilization47-lifecycle-validation.ts`（原作 `Character.Die` 不收回幸存配偶的 Spouse 身份，配偶已故的旧身份不再要求同家族、同国家、无现任配偶）。
  - 引擎：`civilization47-army-ai.ts` 自主停止令先预检，敌军在场不能停止时继续原路线（原先抛错导致整批被拒）。只影响原本会报错的情况，正常存档重放结果不变。
- **性能**：`army-travel47-graph.ts` 寻路改为编译后的类型化数组 Dijkstra（`army-geography47.ts` 冻结会话缓存里的图），与旧算法逐位一致（`army-travel47-search.test.ts` 差分测试，另在 1200 天长跑里双算法并排比对 6588 次查询无差异）；`PresentationClock.tsx` 新增 `minInterval`，游戏传 150ms（`culture47-pacing.ts`）；`CultureWorld47.tsx` 后台推进时 `startTransition(setSnapshot)`。
- **实测**（桌面，2 万格地图）：每日模拟 30.9→23.4ms；生产构建 4 倍速主线程占用 53.7%→20.9%，推进速度不变（约 40 日/秒）。
- **验证**：lint、typecheck；严格逐日长跑（每个世界都用 `execute` 走全部校验）：大陆 16 个世界 1500 天、大陆另一种子 6 个世界、盘古大陆 6 个世界 2500 天、群岛 6 个世界 2500 天，修复后全部通过；浏览器：之前报错码 22 读不回来的开发版存档现在能读回，并在 4 倍速下继续推进 440 天无报错。
- **新测试**：`family-validity47.test.ts`。世界 2 严格推进 40 天在默认测试集里；世界 a 严格推进 705 天约两分钟，用 `LIEGUOJI_LONG=1` 开启。**请 Codex 考虑在 CI 里加一个长测任务（夜间或发布前）**，跑 `LIEGUOJI_LONG=1 npx vitest run src/fms/play/family-validity47.test.ts`。
- **重点回归（请 Codex）**：全量单测 + 浏览器测试；`presentation-clock.test.ts`；读档 / 继续存档（包括 0.5.3 的存档）；浏览器端推进时的 `data-day` 节奏（每批间隔 ≥150ms，不应丢天）。
- **仍由 Claude 修改的文件**：无（本段 SHA 补记除外）。下一批计划继续做后期军事 / 行军的模拟性能，以及 Worker 发往主线程的数据瘦身。
