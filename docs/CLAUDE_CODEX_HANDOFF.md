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
