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
- **提交 SHA**：`4ab4b16241702aca8f21f63d5a2e039aa43bb6da`（版本 0.5.4，已推送 main；Cloudflare Pages success；GitHub Actions 推送时仍在运行，结果待 Codex 核对）。本条为推送后的本地补记。
- **严重问题（已修）**：0.5.x 原作家族世界在部分开局下会出现严格校验不通过的状态。0.5.2 实时推进会在那一天报错卡死；0.5.3 实时推进跳过校验，能继续玩但存档读不回来。用固定 `crypto.randomUUID` 的同一世界对照，0.5.3 与本地改动在同一天、同一错误码失败，确认是既有引擎问题，不是本批性能改动引入的。
  - 校验器（引擎不变，0.5.3 读不回来的存档可直接读回）：`civilization47-population-validation.ts`（已故者的前配偶再婚迁出家族；中途建国当月 `initial-family` 年龄豁免）、`civilization47-calendar.ts`（同一豁免）、`civilization47-lifecycle-validation.ts`（原作 `Character.Die` 不收回幸存配偶的 Spouse 身份，配偶已故的旧身份不再要求同家族、同国家、无现任配偶）。
  - 引擎：`civilization47-army-ai.ts` 自主停止令先预检，敌军在场不能停止时继续原路线（原先抛错导致整批被拒）。只影响原本会报错的情况，正常存档重放结果不变。
- **性能**：`army-travel47-graph.ts` 寻路改为编译后的类型化数组 Dijkstra（`army-geography47.ts` 冻结会话缓存里的图），与旧算法逐位一致（`army-travel47-search.test.ts` 差分测试，另在 1200 天长跑里双算法并排比对 6588 次查询无差异）；`PresentationClock.tsx` 新增 `minInterval`，游戏传 150ms（`culture47-pacing.ts`）；`CultureWorld47.tsx` 后台推进时 `startTransition(setSnapshot)`。
- **实测**（桌面，2 万格地图）：每日模拟 30.9→23.4ms；生产构建 4 倍速主线程占用 53.7%→20.9%，推进速度不变（约 40 日/秒）。
- **验证**：lint、typecheck；严格逐日长跑（每个世界都用 `execute` 走全部校验）：大陆 16 个世界 1500 天、大陆另一种子 6 个世界、盘古大陆 6 个世界 2500 天、群岛 6 个世界 2500 天，修复后全部通过；浏览器：之前报错码 22 读不回来的开发版存档现在能读回，并在 4 倍速下继续推进 440 天无报错。
- **新测试**：`family-validity47.test.ts`。世界 2 严格推进 40 天在默认测试集里；世界 a 严格推进 705 天约两分钟，用 `LIEGUOJI_LONG=1` 开启。**请 Codex 考虑在 CI 里加一个长测任务（夜间或发布前）**，跑 `LIEGUOJI_LONG=1 npx vitest run src/fms/play/family-validity47.test.ts`。
- **重点回归（请 Codex）**：全量单测 + 浏览器测试；`presentation-clock.test.ts`；读档 / 继续存档（包括 0.5.3 的存档）；浏览器端推进时的 `data-day` 节奏（每批间隔 ≥150ms，不应丢天）。
- **仍由 Claude 修改的文件**：无（本段 SHA 补记除外）。下一批计划继续做后期军事 / 行军的模拟性能，以及 Worker 发往主线程的数据瘦身。

### 2026-10-23 · Claude 看到的 0.5.3 CI 结果（请 Codex 分析）
- `2c486543`：Build and unit checks success；6 个浏览器分片全部 failure，失败步骤都是 "Run every browser test in this project and shard"（产物哈希比对步骤已通过），所以是用例失败，不是构建 / 哈希问题。日志从 Azure blob 下载时一直 EOF，Claude 没拿到具体用例。
- 7aa7c6a 的浏览器测试当时被跳过，所以这些失败可能从 0.5.2 甚至更早就存在。0.5.4（`4ab4b162`）又改了推演节奏（每批至少间隔 150ms）和面板渲染方式（transition），依赖推进节奏或 `data-day` 立即更新的用例可能受影响。
- 请 Codex 给出失败用例和证据：属于玩法 / 节奏问题的交给 Claude 修，属于测试本身的由 Codex 修。

### 2026-10-23 · 0.5.5（Claude Code）→ 交给 Codex 回归
- **提交 SHA**：`49dacf5c29a052ef2afc1f622f2b2bd8d8cd2819`（版本 0.5.5，已推送 main；Cloudflare Pages success）。**GitHub Actions 没有运行**：任务在 2 秒内失败、没有执行任何步骤，注释为 “The job was not started because recent account payments have failed or your spending limit needs to be increased”，属于账户付费问题，已告知用户；问题解决后请 Codex 重新运行这次 CI。（本条为推送后的本地补记。）
- 0.5.4 `4ab4b162` 的 CI：Build and unit checks success；6 个浏览器分片全部 failure（与本地对照结果一致，见下文）。
- **严重问题（已修）**：家族每月自动发动的叛乱或内战（`checkFamilyRebellions47` / `checkCivilWars47` → `foundState47`）建国后，没有给新国家补战损记录，下一次每日结算的 `assertLosses` 就会失败，推演停在「战损记录损坏」。一般在第九、十年出现：3500 天扫描 6 个世界里有 2 个失败，开发版存档在第 3621 天失败；0.5.4 代码在同一天同样失败，确认是本来就有的问题。修复：`civilization47-political-owner.ts` 在 `advanceNobility47` 之后调用 `reconcileLosses`（只补缺失的记录，正常世界里不做任何改动）。回归测试 `family-rebellion-monthly.test.ts`：去掉修复会失败，加回后通过。
- **性能（模拟结果逐位不变：同一固定世界推进 800 天，与 0.5.4 的世界状态 sha256 相同）**：
  - `display-delta47.ts`（新增）+ `culture47-display.ts`：更新包的 `run` 改为结构化增量（`delta` 字段，按内容逐层比较，主线程在上一份数据上打补丁），`journal` 仍然整份发送。后期每批数据约 760KB→50KB。数据包格式变了，`culture47-display.test.ts` 已同步更新；`tests/` 下读 `display.journal` 的浏览器测试不受影响。
  - `army-commands47.ts`：一次寻路只算一次位置图（原来每支军队要算 2–3 遍）；目标格按已冻结的地图缓存（`travelGraphSealed47`）。`civilization47-army-ai.ts`：同一支军队的行军速度按地表类型和省份缓存。
  - `army-geography47.ts`：在数值窗口内（`ownedTerrainWindow47`），地形对象和省份边界都相同就直接复用，跳过逐项比对。
  - `geography-content47.ts`：复制候选世界时，退役档案只浅复制 `records` 这一层，每条记录冻结后共用（写入后不可变）。
  - `army-retirement47.ts`：`assertArmyRetirement47` 在快速模式下跳过（与其他整体校验器一致）。
  - `territory-labels.ts`：国名排布按「国家 + 省份集合」缓存，只重算有变化的领土块（`territory-labels.test.ts`：结果与清空缓存后从头计算一致）。
- **实测**：后期（第 1400 天以后）每日模拟 26.8→20.7ms。
- **验证**：lint、typecheck；新增的 `display-delta47`（3000 组随机增量往返，外加真实会话 30 批重建与 Worker 快照一致）、`territory-labels`、`family-rebellion-monthly` 都通过；开发版后期存档从第 3619 天推进到第 4028 天无报错。`src/fms` 全量单测 177 个文件、1761 项通过（1 项长测跳过）；5000 天严格扫描 6 个世界，a–e 全部通过（b、c 修复前在第 3256 天失败），f 见下方「新发现」；生产版冒烟测试：新世界 4 倍速推进约 1000 天无报错，存档、刷新、读档（336ms）、继续推进均正常。
- **浏览器测试（本地 desktop-chromium，CPU 空闲时，0.5.5 候选与 0.5.4 构建对照）**：`fms-culture47-motion` / `pipeline` / `active-world`（2 项）/ `army-recovery-ui` 在 0.5.4 构建上同样失败（超时，以及 active-world「状态份数 ≥30」、motion「连续变化」两条断言），这一轮没有新增失败。0.5.4 起后台推进改为每批至少间隔 150ms、面板用 transition 渲染，按批次计数或依赖 React 日期立即更新的断言可能因此失效。请 Codex 分析：属于测试计数/节奏假设的由 Codex 修；如果确实是显示连续性问题（motion 的 gap ≤750ms 那条），给出证据交给 Claude。
- **为适配增量协议，Claude 改了 4 个测试**（Codex 请知悉）：`fms-culture47-active-world.spec.ts`、`fms-culture47-army-recovery-ui.spec.ts` 改为监听客户端新增的 `culture47-snapshot` 事件（带解码后的完整快照，不做复制）；`fms-culture47-motion.spec.ts`、`fms-culture47-pipeline.spec.ts` 改读更新包新增的 `display.tick`。
- **新发现，未修（下一批由 Claude 处理）**：5000 天扫描中，世界 f（固定 UUID 标记 `f`，大陆地形，种子 421730）在第 4922 天出现人口校验错误码 18（姓名、身份、文化或出生记录对不上，第 13 年以后才出现）。
- **请 Codex 关注**：数据包格式变化对浏览器测试的影响（`display.kind==='update'` 现在带 `delta`，不再带 `run`）；长测任务里可以加上 `family-rebellion-monthly.test.ts`。

### 2026-10-23 · 0.5.6（Claude Code）→ 交给 Codex
- **提交 SHA**：推送后补记。随本版一起推送的还有本地已存在的 `edadb96e`「工程：自动测试改为本地运行，GitHub Actions 只保留手动触发」（作者是用户账号，另一个会话提交的；改了 `ci.yml` 和 `AGENTS.md`）。按新规则，发布前在本地跑 `npm run check`，推送后核对正式站 `build.json`。
- **改动**：
  - `culture47-session.ts` `build()`（读档/重放）：连续的推进操作在快速校验模式下按每批最多 10 个走 `advanceSessionBatch47`，遇到存档分叉的身份切换点时断开；玩家操作仍逐个严格执行；最后对最终世界跑 `assertPolitics47`（有 foundings 时再跑 `assertFoundings47`），与检查点恢复的校验相同。十年世界（3625 步）从 327–413 秒降到 74 秒。
  - `checks47.test.ts`：改为「快速实时推进」和「成批 load」都要等于逐个操作的严格 `execute`。
  - `force-motion47.ts`：移动阶段的部队键按下标只算一次（`positions()` / `contacts()` 传 keys）。
  - `force-losses47.ts` / `force-accounting47.ts` / `force-tick47.ts`：军事窗口核心里的交锋结算直接修改私有候选（`owned=true`），结算前先保存伤害余数供后面读取。
- **结果不变**：世界 a 推进 800 天的哈希与 0.5.4 相同；世界 b 推进 2500 天的哈希与 0.5.5（`49dacf5c`）相同。
- **实测**：后期实时推进（关闭采样器，各跑两次）0.5.5 每天 17.7–18.1ms，本版 17.0–17.8ms。
- **本地全量检查（发布前，`npm run check` 的各步）**：lint、typecheck、`npm test`（186 个文件、1870 项通过，1 项跳过）、build 全部通过。`playwright test`（3 种设备）：156 项中 49 项通过、107 项失败或超时，耗时约 8.4 小时（30333 秒）。有失败的测试文件（失败数/总数）：active-world(6/9)、army-recovery-ui(3/3)、autonomous-history(3/3)、coastline(3/3)、continuation(3/3)、family(3/3)、generations(6/6)、history(3/3)、house-governance(3/3)、houses(3/3)、lifecycle(3/3)、mobile-sheet(2/3)、motion(3/3)、news(3/3)、ocean-style(3/3)、pipeline(3/3)、reference(3/3)、resume(12/15)、retirement(7/9)、save-scope(15/18)、throughput(3/3)、warm-throughput(3/3)、fms-experience61-throughput(3/3)、fms-full-map(3/6)、fms-generation58(1/6)、fms-speed68(3/3)、fms-territory64(1/3)。其中 `resume` 只在桌面设备上对照过：0.5.5（`49dacf5c`）与本版结果完全一致（1 项通过、3 项失败、1 项超时），说明不是本版引入。很多失败用例依赖 0.5.0 已删除的旧引擎（continuation / generations frozen 等），或依赖早期的界面与节奏。**请 Codex 整体梳理浏览器测试**：过时的用例要么删除要么更新；如果确实是玩法问题，附证据交给 Claude。整套跑一遍要 8 小时以上，建议先按设备或文件拆分。完整 JSON 报告只在本地（没有提交）。
- **仍由 Claude 修改的文件**：无（本段补记除外）。

### 2026-10-23 · 事故记录：Claude 误提交并推送了别人未交接的改动（Claude Code）
- 这次推送 `49dacf5c..67a5de38` 一共带上了 5 个提交：`edadb96e`（CI 改为手动）、`6dbed4ad` / `736325ad`（手机双击放大、长按菜单修复）、`d420298c`（另一个会话替 Claude 提交的 0.5.6 本体）、`67a5de38`（Claude 的提交）。
- 问题出在 `67a5de38`：Claude 用 `git add -A` 把工作区里**另一个会话还在开发、尚未交接**的「电脑计算 / 远程主机」改动也一起提交了：`scripts/host.mjs`、`scripts/host-engine.mjs`、`src/fms/play/wire47.ts`、`wire47.test.ts`、`culture47-remote.ts`、`RemoteBadge47.tsx`、`CultureWorld47.tsx`（徽标）、`culture47-client.ts`（有远程主机时先尝试连接）、`culture47.css`、`vite.config.ts`（vitest 并行数）、`public/_headers`（CSP 的 connect-src 增加了 `wss://*.trycloudflare.com` 和本机 ws）、`.github/workflows/ci.yml`（`VITEST_MAX_WORKERS`）、`docs/FMS_ORIGINAL_COVERAGE_2026-10-23.md`。这些内容已经由 Cloudflare 部署到正式站（`build.json` commit 为 `67a5de38`）。
- 影响评估：远程主机只有在网址带 `?host=wss://…&code=…`（或 localStorage 里已有记录）时才启用，否则照旧用本地 Worker，徽标也不显示；默认游戏行为不变。实际变化是 CSP 放宽了，以及 vitest 默认改为多核并行。
- 没有改写历史，也没有回滚：回滚会删掉对方工作区里还在开发的文件。等用户决定保留还是撤回。
- 今后的做法：Claude 提交时只 `git add` 自己改过的具体文件，不再用 `git add -A`；提交前先核对 `git status`，确认没有别人的改动。
- **用户决定（2026-10-23）**：远程主机 / 电脑计算是用户自己在做的功能，先保留在 main 上，不撤回。之后由用户（或用户指定的会话）继续开发，Claude 不修改这些文件：`scripts/host*.mjs`、`wire47*`、`culture47-remote.ts`、`RemoteBadge47.tsx`。

### 2026-10-24 · Codex C1 地图文字稳定性（本地候选，未发布）
- 用户选择 C（地图与界面体验），授权本批直接实现。基线 main af1ddf91 / 0.5.11。
- 本批拥有：src/fms/play/map.ts、city-labels.ts、map-label-layout.ts、city-selection.test.ts；tests/fms-label-stability.spec.ts。本段为追加交接。
- 修复：选中地块仍保留其普通名字的布局占位，只隐藏该名字的绘制并显示选中提示，避免周围文字重排；首都与普通城市使用 Pixi 实际字形尺寸避让；普通城市字号 9→11；选中提示不再避让自己的旧名字。
- 验证：相关单测 4 文件 / 20 项通过；npm run build:cf（全局 lint、类型、生产构建、35 项产物白名单）通过；新浏览器用例在桌面/手机尺寸 Chromium 共4项通过，开发版与生产版各跑一轮。验证选择前后布局不变、拖动坐标平移不改变国名字号，以及种子421730生成地图全景/近景实际截图。手机尺寸不是 iPhone 真机。
- 生产候选试玩：http://127.0.0.1:5394/?fms=1，仅本机。服务状态需下次核实。
- 日志：.autopilot/label-stability-unit.txt、label-stability-build.txt、label-stability-production-browser.txt。截图：test-results/fms-label-stability-genera-ac552--at-overview-and-close-zoom-mobile-chromium/original-close.png 等（本地，不作为原作等价验收）。
- 待做：竖屏地图上下留白过大、动态军队与城市名重叠、完整字体/菜单还原。国名倾斜与版图锚点原已实现，没有重复声称为本批新增。
- 发布状态：未提升版本、未提交/推送。全量 npm run check 尚未通过本批验证；历史浏览器失败记录保留。工作区已有 Claude 的 CultureNationOverview47.tsx 与本文件旧补记，未纳入提交、未清理。整版发布需先完成全量检查与明确文件交接，不能用本批4项替代。

### 2026-10-24 · Claude 改动了 map.ts 的几行（0.5.17，已提交）
- 为原作视图（文化/宗教/家族/联盟视图的名字与边界）在 `map.ts` 的 `draw()` 末尾新增参数 `viewGroups`，并改了国名标签、国界线、territoryLabels 调用这几处；与 Codex C1 未提交的改动（城市名布局）不重叠。提交时只应用了 Claude 自己的补丁，Codex 的 C1 改动仍在工作区未提交。
- `territory-labels.ts` 的 `territoryLabels(world, groupOf?)` 新增可选分组参数，默认行为不变。

### 2026-10-24 · Codex 图像参考与 Claude 后续实现
- 用户明确要求：用 image 生成游戏画面与界面参考，并让 Claude 接续；复用此前 Codex 地形、地图文字等多版本成果。
- 图片：docs/design-reference/2026-10-24/lieguoji-map-ui-reference.png。
- 执行说明：docs/design-reference/2026-10-24/CLAUDE_IMPLEMENTATION.md。Claude 下一批请先阅读，盘点已有成果和当前文件锁，再按地图/文字/桌面与手机布局分批实现。
- 本批只新增参考素材和说明、追加本记录；未修改或交接其他会话的游戏代码。参考图不是原作规则来源，禁止整图贴背景或把国名城市军队数据烘焙进纹理。
- 最新发布规则沿用 AGENTS.md：本地 npm run check，Actions 仅手动，部署核对正式站 build.json。

### 2026-10-24 · Codex 接手参考图第一批（进行中）
- 用户已要求 Codex 先执行。新增占用：land-camera47.ts / land-camera47.test.ts、original-play-renderer.ts、culture47.css；本批只调整视觉和初始取景。保留 C1 文字稳定性与 Claude 引擎修改。
- 目标：手机进入地图铺满，暖纸紧凑面板、降低政治色遮蔽、蓝绿海水。完成后追加真实验证结果。

### 2026-10-24 · Codex 参考图第一批完成（本地候选，未发布）
- 改动：land-camera47.ts 竖屏进入时也使用 cover 取景，消除宽地图上下大片空白（代价：默认看到局部，可使用现有全图/缩放）；land-camera47.test.ts 新增360×800、390×844、1440×900边界测试。
- original-play-renderer.ts：paper 外观使用现有羊皮纸渲染管线，海色 0x8eafb1 / 0x527c86，政治层透明度 .78；原作预设常量不变。不是新增山林精灵，也没有改地图几何。
- culture47.css：游戏浮层改暖纸色、黄褐细边，栏10px/面板12px圆角，保留按钮事件与面板逻辑。
- map.ts：仅在已有 C1 代码上调整地名/国名深墨色和浅描边，保留避让、锚点、分组和选中稳定性。
- tests/fms-label-stability.spec.ts：选城测试原固定窗口未涵盖截图中实际可见城市（y约645，原上界624），扩大到无遮挡的可见区域；没有删除文字布局稳定性断言。
- 验证：相关3文件22项单测通过；npm run build:cf（lint/类型/生产构建/35项白名单）通过；桌面/手机4项浏览器回归在dev和生产各通过一轮。git diff --check 通过。
- 生产截图：.autopilot/reference-ui-production/；本机预览 http://127.0.0.1:5396/?fms=1（后续需核对服务仍在）。手机浏览器模拟不等于真机验收。
- 尚未完成：参考图中的手绘山脉/森林细节、军队旗标与城市字避让、桌面侧栏整体布局和完整美术还原；现有河流仍沿用原作高亮色。应继续用真实地形/动态数据实现，不能用参考大图替代地图。
- 发布边界：未提升版本、未提交或推送；共享工作区有Claude未交接的军队/存档与版本文件，不纳入本批。未完成全量npm run check，不能称正式发布通过。本批文件可由Claude接续，但仍需保留其他会话C1未提交成果。

### 2026-10-24 · Claude 接手发布 Codex 参考图批次（0.5.21）
- 用户要求「下一版按照 Codex 交接的内容继续更新」。本版由 Claude 一并发布 Codex 未提交的三批：C1 地图文字稳定性；参考图第一批（竖屏铺满取景、暖纸浮层、蓝绿海水、政治层透明度 .78、桌面事件栏左下）；以及交接记录之后的第二批（国界/省界沿实际渲染的 Voronoi 格子边、按高度与生态的山脉森林装饰、河流按外观换色、tests/fms-cell-boundaries.spec.ts）。
- 第二批与 Claude 0.5.17 的视图分组兼容：格子边界按 `groupOf` 分组，文化/宗教/家族/联盟视图的边界随视图变化。
- 参考大图 lieguoji-map-ui-reference.png（3MB）不入仓库，只提交 CLAUDE_IMPLEMENTATION.md。
- 之后这些文件由 Claude 继续按 CLAUDE_IMPLEMENTATION.md 推进（军队旗标与城市名避让、桌面侧栏布局等）；如 Codex 需要再改，请先在本文件登记占用。

### 2026-10-24 · Codex 手机触控修复（进行中）
- 用户要求修复手机双指缩放、二级菜单滚动并发布。当前基线 6101bc69 / 0.5.24；仅有未跟踪参考大图，保留不提交。
- 本批占用 src/main.tsx、src/fms/play/CultureWorld47.tsx、src/fms/play/culture47.css、触控相关新增测试；版本与日志待验证后更新。
- 先以真实触摸事件回归，随后核对 Claude 军事计划的剩余差距。不会把桌面移动仿真称为 iPhone 真机验收。
- 军事追加占用 force-activity47.ts / force-activity47.test.ts：修复玩家航行令被错误显示成出生母港；无任务舰队不再伪造返港目标。属于现有舰队指挥可读性修复，不变更模拟或存档格式。
- 2026-10-24 Claude 收尾：用例最后一步失败原因是 Chromium 惯性滑动后的第一次点触只用来停住惯性、不产生 click（不是应用缺陷）；用例改为先点一下无交互的标题。随 0.5.25 发布，以上占用文件释放。

### 2026-10-26 · Codex 接续 Claude 0.5.39 海军信息
- 用户明确要求接续现有工作区，依次发布 0.5.39、0.5.40。基线 main e41bff65 / 0.5.38；接收 Claude 留下的海军信息、跟随、覆盖清单与版本日志，不另起项目。
- 收尾修复：暂停时开启跟随立即居中；舰队离开可显示集合后解除跟随。新增浏览器断言验证真实舰队坐标投影到画布中心，不能只以复选框勾选代替镜头生效。
- 验证：舰队信息、官员任用、连续推进、RTS、国家系统共 15 项浏览器回归通过（桌面、手机尺寸、平板尺寸 Chromium）；本地截图位于 `.autopilot/navy-039-final/`。不是手机真机验收。
- 全量检查首轮 lint / typecheck / 210 文件、1933 单测 / 生产构建通过。收尾后重跑 `npm run check -- -- --max-failures=1`，lint/typecheck 通过，1932 单测通过、1 跳过，full-map-terrain 一项超过默认 5 秒；该文件独立复测 8/8 全通过。全套浏览器另行首错停止运行，旧 actions65 使用隐藏的 `.c47-nations button` 导致超时，不能声称全套通过。原始日志保留于 `.autopilot/release-0.5.39-check.log`、`release-0.5.39-final-check.log`、`039-timeout-recheck.log`、`full-browser-039.log`。
- 参考 PNG 按 Claude 0.5.21 约定仅本地保存，通过 `.git/info/exclude` 排除；未删除、未进入 dist 或提交。
- 下一批 0.5.40 由 Codex 负责 display-settings47、CultureMenu47、map.ts、original-play-renderer.ts 及 CultureWorld47 的显示连接；仅补原作 DisplaySettings，不改模拟规则。覆盖比例沿用可核对的文本统计，不据此宣称玩法全部还原。

### 2026-10-26 · Codex 0.5.40 地图外观补全
- 0.5.39 已推送 main，提交 cbbda721；正式站 build.json 已核对 version=0.5.39、commit=cbbda721707d0e011d82dac272150d82e2e42e6b。
- 0.5.40 接入原作 DisplaySettings 中 ProvinceBorderColorImage、DisplayProvinceBorderToggle、DisplayBurgNameToggle、IsEnableBiomeIconToggle、StateMapTransparencySlider。省界颜色/开关使用实际格子边，改变设置会失效重绘缓存；隐藏省界仍保留国界与选择轮廓。地形层通过已有 Graphics.visible 控制，政治色混合只更新现有 mesh 颜色。
- 显示设置保存在原 localStorage key，新增字段兼容旧值；默认 stateOpacity=null 表示沿用外观预设（paper 为 .78），避免恢复默认强行覆盖其他预设。模拟规则和 journal 未修改。
- 新增单测覆盖旧偏好迁移、显式关闭/零浓度、损坏数据与数值边界。全量本地检查 lint/typecheck、211 文件/1936 单测通过（1 跳过）、生产构建/42 产物白名单通过。全套浏览器首错停止仍遇到 actions65 的隐藏国家列表按钮；保留原用例，未跳过 hook。
- 新的外观浏览器测试使用真正生成的 421730 地图而非简化 fixture，保存地形后刷新，等待原作 Voronoi 渲染器就绪再缩放，验证设置保留及恢复；另跑舰队、官员、连续推进、RTS、国家系统回归。三种尺寸共 18 项通过，不代表真机验收。
- 日志：`.autopilot/release-0.5.40-check.log`、`display-040-unit.log`、`display-040-final.log`、`regression-040.log`。外观截图：`.autopilot/display-040-final/`。这些文件仅本地保存。
- 覆盖清单保留 Claude 的 639/1419 文本快照，逐项列出本版已接入字段，未臆造新的总覆盖率。地形装饰还不是原作美术完整还原；旧浏览器测试入口仍需独立整理。
- 本批涉及的显示文件在发布后释放，可在此基础继续推进。远程主机/电脑计算相关保留文件未修改。

### 2026-10-27 · Codex 0.5.41 属性实际效果（已发布）
- 用户已明确优先属性系统，并选择人物、国家、军队三类全部推进。以 main 8064e99f / 0.5.40 为基线；撤回本批尚未提交的家族树尝试，保留既有家族操作。
- 接通国家特性至初始军队、后续征募和叛军换属时的速度/伤害快照：CavalryTradition、FieldCombatElite、SiegeCapture。原有军队快照不因每日记录而重写。无国家特性账本的旧内核测试保留原有显式 damageTraits 来源。
- ManifestDestiny 在开局政治挂接与后续国家记录时同步，仅布尔变化时刷新次数；不每日重抽，不直接覆盖当前国运。Ambitious 从当前真实领袖进入原作宣战权重，不再固定 false。
- 人物与官员候选显示实际四维/特质；国家显示实际国运、中央官员收入倍率、财政战力倍率；军队显示实际位置的战斗效率、对军/攻城基础伤害和初始化速度。最终伤亡另受兵种、地形、兵力等因素影响，基础伤害不是每次固定扣血。
- 原作只读证据：原 character traits JSON、localization.csv 和已有 native kernels。新增二进制字段引用核查位于 .autopilot/fms-audit/binary/attribute-041：FightToTheEnd 在旧 State.TryEndWar/War.Start，BullyTheWeak/DefyTheStrong 在旧 DiplomacyUtil，当前 WarAIV2 宣战/和谈入口没有这些字段读。TotalWar 仅找到属性存取，不能把这些旧逻辑强加给新版战争流程；四项在 UI 标注效果待还原，后续需要追踪实际调用路径。
- 验证执行中：.autopilot/release-0.5.41-check.log；新增五项接线/实际财政对照测试已通过，原作军事/速度/国家回归 40 项已通过。新浏览器测试 tests/fms-attributes.spec.ts 覆盖人物四维和军队实算信息。
- 规则变更需要新建世界；版本门禁继续仅接受当前版本存档，不迁移或删除旧档。
- 浏览器：属性/官员/国家系统 9 项通过；属性滚动可见性、家族操作、舰队信息与连续推进最终 15 项通过（属性 3 项重复，共 21 个不同用例）。日志 attributes-041-browser.log、attributes-041-final-browser.log，截图目录同名去掉 .log。手机 headless 截图的属性面板文字正常，但面板外有黑块绘制异常；未证明真机同样出现，亦未把自动化通过当作真机视觉验收。
- 最终全量检查：.autopilot/release-0.5.41-final-check.log，lint/typecheck、212 文件/1941 单测通过（1 跳过）、构建/42 产物白名单通过。完整浏览器仍在 fms-actions65:16 的隐藏 .c47-nations button 超时，1 失败/203 未运行；保留原用例，不声称全套通过。
- 已对照 .autopilot/regression-040 中的 mobile offices.png：同样存在面板外黑块，属于已有截图异常。本版未修复，不作真机视觉验收。

### 2026-10-27 · Codex 0.5.42 地形行军属性实施与验证
- 0.5.41 已推送 a421c5c8 并核对正式站 build.json，正式站属性浏览器测试 1 项通过。当前以干净 main 为基线继续。
- 继续核查剩余国家特性：State.UpdateDiplomacy 的 V2 开关分支明确区分新旧宣战；本批不把旧外交特性强行加入 V2。
- 恢复 Biomes.SpeedModifier 的 13 项 float32 初始化表，52 字节 SHA256 与元数据字段名完全一致。Army.GetSpeed 先判断当前省份山地/高原，再索引当前格子的生物群系；非省份平均值。审计中间文件只在 .autopilot/fms-audit/binary/attribute-042。
- 热/冷沙漠、积雪 0.7，其余 1；山地 0.5、高原 0.7 覆盖普通地形，不叠乘。网页旅行格仍是三角面，用面中心最近陆地源顶点的生物群系（同距离按顶点编号）明确适配；新世界保存 faceBiomes，非原作家族兼容测试世界保持旧速度策略。
- 本批修改 force-speed47、civilization47-forces、新增 force-biomes47、native-war/biome-speed、army-movement-info47，军队面板、相关测试、版本与公告；发布后释放。
- 针对性 19 项单测通过，包含真正 advanceArmyTravel47 的同军队、同路线、同时间移动距离对照。属性、连续推进、军队调遣三种尺寸共 9 项浏览器测试通过；军队面板地形行改为全宽后属性 3 项再次通过，断言面板速度与初速、兵种、地形的乘积一致。
- 全量 npm run check 的 lint/typecheck 通过；1942 项单测通过、2 项 full-map-terrain 超过默认 5 秒、1 项跳过，独立复测该文件 8/8 通过。生产构建与 42 项产物白名单通过。原始日志 release-0.5.42-check.log、attributes-042-map-retest.log、attributes-042-build.log、attributes-042-browser.log、attributes-042-final-browser.log 均在 .autopilot。
- 完整浏览器另行执行首错停止，仍在 tests/fms-actions65.spec.ts:16 的隐藏 .c47-nations button 超时：1 失败、203 未运行，日志 .autopilot/attributes-042-full-browser.log。未改动或跳过原测试，不声称全套通过。下一批需要修复这项旧入口测试，地形路径几何仍需继续向原作靠拢。

### 2026-10-27 · Codex 0.5.43 人物属性明细
- 基线干净 main 6f466383 / 0.5.42，fetch 后远端无新增提交；继续当前共享工作区。
- 原作只读核查 GetMilitaryLeadershipSkill / GetMilitaryLeader / CalculateLeadershipModifierInternal，审计在 .autopilot/fms-audit/binary/attribute-043。统率技能调用没有把 LeadershipModifierCap 当额外倍率，不擅自添加。
- 新增 character-attribute-info47 与 CharacterAttributeDetails47，家族人物选中后显示基础、修正、当前值；调用现有原作税收/叛乱抵抗/海战/敌国战斗函数，说明领袖条件和最终概率边界。改革家明确待还原。本版主要是现有属性的可读明细，不改变模拟规则。
- 3 项单测通过（含原作结算/伤害/随机叛乱对照）；三种尺寸属性和家族行为 9 项浏览器测试通过。日志 .autopilot/attributes-043-unit.log、attributes-043-browser.log。已查看桌面/手机截图：明细表格可读，手机面板外既有黑块仍在，不作真机验收。
- 本批文件：CultureFamilyPeople47、culture47.css、新增人物明细与模型/测试、fms-attributes.spec.ts、版本和文档；发布后释放。
- 全量检查 .autopilot/release-0.5.43-check.log：lint/typecheck、214 文件/1947 单测通过（1 跳过），生产构建/42 产物白名单通过。
- 完整浏览器首错停止仍在 fms-actions65:16 的隐藏 .c47-nations button 超时，1 失败、203 未运行。保留失败，不跳过 hook，不声称全套通过。正式站版本/提交及线上属性检查在发布后另核对。

### 2026-10-28 · 0.5.45 iOS 接续集成（Codex）
- 从 GitHub 最新 a333b5c0（PR #28、0.5.44）快进本地 main 后实施，保留 capacitor URL 与安全区修复。
- 新 AppIcon、悬浮按钮及可折叠工具网格；取消手机行军 30Hz 上限、编队位置减少临时数组、无战斗时省去全军显示坐标集合。
- 验证详见 CHANGELOG 0.5.45 和 docs/ios-proof；单测全过、专用 WebKit 2/2、手机动画回归通过，全量浏览器首次被历史外交断言阻断；该断言已修正且单独回归通过，全量重跑中，不能宣称全绿或真机 120fps。
- 用户要求交付未签名包，使用现有手动 ios-unsigned 工作流；无需改动签名凭据。
