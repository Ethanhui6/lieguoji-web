# V4 本地开发与统一发布规则

> **2026-10-19：推送发布锁已正式解除。** `.githooks/pre-push` 退出 0，不再限制远端、引用或快进，也不再调用 `scripts/check-release.mjs`。`scripts/check-v5-plan.mjs` 不再要求 `releasePolicy.state=locked`、`cloudWritesAllowed=false`，也不再要求 `webRebuild.release` 保持 local-only，不再要求 `releasePolicyUnchanged`。`npm run release:status` 与 `npm run release:check` 仍只报告正式发行是否就绪，失败不会挡住 git push。`plan/tasks.json` 与 `plan/release-readiness.json` 本次不改，因此记录里的 locked / not_ready 还在，由计划文档批次更新；未完成的 PH、真机和用户视觉验收没有被改成通过。仍只部署 `dist`，唯一生产链不变。以下各节是 2026-09-23 起已退役机制的记录。

> 2026-10-04：产品开发已转为 [V5](../CODEX_AUTOPILOT_V5.md) 的原作网页重建顺序。当时的云端冻结与 pre-push 现已退役；新 8 阶段通过仍然不会自动满足旧的正式验收记录。9月24日单次试玩例外已消耗。

> 2026-09-24 最新用户指令例外：用户明确要求现在上传最新版本到 GitHub / Cloudflare 试玩。仅本次经检查、指纹绑定的 codex/ph06-world-generation 分支预览获授权，保留 main 和全部 PH 状态；详见 [本次试玩范围](PLAYTEST_RELEASE_2026-09-24.md)。以下全PH门继续作为其余发布的默认规则；不得绕过更新后的 pre-push。

生效于用户 2026-09-23 最新指令：大型地图、不同国家制度、家族信仰、iOS 质感、完整独立 PWA；**全部 PH 验收后才打包上传 GitHub／Cloudflare**。这取代 V3 中逐批推送、预览、云端建任务和生产发布的授权节奏。

## 已退役的锁定范围

下列限制在 2026-10-19 之前生效，现已不再拦截推送。发布状态记录仍在 `plan/tasks.json.releasePolicy`（本次未改该文件，记录仍可能是 `locked` / `cloudWritesAllowed: false`）。全部必需 PH 曾是 PH00—PH35。原 25 项任务独立保留，不用它们的历史 done 抵消新 PH。

| 锁定期可执行 | 锁定期禁止（2026-10-19 起不再执行） |
| --- | --- |
| 项目本地开发、依赖、编辑、测试与性能基准 | push 任意分支或 tag，包括文档分支 |
| 本地分支／提交及项目内非秘密检查点 | 新建或修改远程 PR／Issue／Milestone／Release |
| 用于测试的临时构建、localhost、必要的本地可信 HTTPS 真机测试 | 发布归档、GitHub artifact 上传、Pages 预览或生产部署 |
| 必要的现有资源只读核验 | 新部署链、付费、DNS／账户级修改、读取凭证 |

保留已有站点和资源，不撤站、不关闭 CI、不删除旧部署。当时冻结的是新工作的云端写入与触发，不声称已配置 GitHub 或 Cloudflare 的服务器级禁用。唯一现有链仍是私有 `Ethanhui6/lieguoji-web` → Pages `lieguoji-web`；main 生产、其他分支预览。锁定期认为不推 main 仍不足以避免预览，所以停止了全部 push。该推送禁令现已解除。

## 本地防误操作

- `npm run plan:check`：检查旧任务保护、PH 清单、依赖 DAG、子项状态与证据；未完成 PH 不妨碍正常本地开发。
- `npm run release:status`：只读显示当前门禁状态，不生成发行包、不访问云端、不解除门禁。
- `npm run release:check`：只读地按正式发行标准失败关闭。它不再被 pre-push 调用，因此未完成 PH 不会挡住普通推送。
- `.githooks/pre-push` 在锁定期调用上述检查，并且只在本仓库、单个分支、当前 HEAD、快进时才可能通过。2026-10-19 起该 hook 改为直接成功，不再执行这套限制。本地若仍设置 `core.hooksPath=.githooks`，推送会走到这个已退役的 hook，不需要 `--no-verify`。

锁定期里，Git hook 是防误操作工具，并非不可绕过的服务器保护。解除方式是改 hook 和对应测试，而不是用 `--no-verify` 跳过仍在生效的检查。目录缺文件、格式错误、证据找不到等情况，在正式发行报告里仍应失败关闭。公开构建不包含这些文档、计划、hook、存档和检查点。

## 正式发行仍要的事实

下面是正式发行报告继续使用的标准，不是推送前提。`plan/release-readiness.json` 仍是本地验收事实索引，本次未改，记录里的检查仍是 pending。正式发行前仍须证明：

1. PH00—PH35 和全部子任务 done，依赖无缺口，每项均有实际证据。
2. 全量本地回归、规模与长局、存档／旧引擎兼容、素材和隐私审查均通过。
3. 真实 iPhone PWA、Android PWA、桌面、平板核心流程和连续触控通过；仿真不替代。
4. 用户对实际新版关键 UI 与操作完成视觉验收。不是批准一句“采用 iOS 风格”，也不是代理替用户勾选。
5. 待发布源码与验收时的源内容指纹一致；本地候选已提交且工作区干净。再改源码后必须使就绪记录失效，补验受影响部分并重新记录。锁定期的 pre-push 还曾只允许向本项目仓库推送当前 HEAD 的一个分支；该限制已随 hook 退役。

指纹不包含其自身的就绪文件，以免循环自引用；算法、文件范围和排除项由检查脚本明确控制，不允许调用者任意忽略未验收源码。任务状态与验收证据也不能被事后修改而继续复用旧指纹。原 0.4 CI／HTTPS 报告只证明旧版本，不能填入新版验收空位。

`npm run release:check` 仍要 `releasePolicy.state` 为 `ready`、`cloudWritesAllowed` 为 `true`，并且 readiness 为 `ready`、十项检查为 `passed`；它们必须同时满足全部 PH、证据、源码指纹及干净工作区校验，单改状态不能让正式发行报告通过。这只约束这份报告，不再约束 git push。认证能力配置路径默认列为 PH34 安全审查事项，只报告路径，不读取内容、不自动放入允许清单；当前项目 `.npmrc` 仍须此审查。存在未处理候选路径风险时，正式发行报告禁止放行。

真机验收可用项目范围内的可信本地 HTTPS 与实际设备完成；设备信任安装等必须由用户本人确认时，给最小操作请求。不把普通手机局域网 HTTP 当作安全上下文验收，也不为验收提前部署 Cloudflare。[MDN：安全上下文](https://developer.mozilla.org/en-US/docs/Web/Security/Defenses/Secure_Contexts)

## 解除后仍需真实云端验证

满足本地门禁后，才进入 `releaseVerification`，避免把上传后才能完成的云端检查当成上传前必须已有的证据：

`本地所有 PH 验收 → 发行候选源审查与打包 → 首次候选 push → 同提交 CI／Pages 预览 → HTTPS 实测 → 受控合并 → 唯一原生生产链 → 生产验证`

使用已存在的私有仓库和 Pages 项目，先查后复用，不新建重复资源。CI 仍包含 lint、类型、单测、构建、发布内容审计和核心浏览器测试。只部署 `dist`。免费私有仓库既有分支保护 API 限制仍如实记录，不能升级套餐、改公开或管理员绕过。

云端检查失败仍是失败，修复后按同提交重新核验；本地所有 PH 完成不等于已成功发布。最终记录真实 commit、实际部署 ID／URL、CI、HTTPS、PWA 更新与存档恢复证据。原生 Pages 不天然等待 GitHub CI，继续坚持分支验证后受控合并。

## 旧线上基线

规则改变前已发起的最终 0.4 交接发布：`b9b8f96b40544ef8b7e1e428910fe2df64fec6f7`，固定部署 `https://a257d63e.lieguoji-web.pages.dev`，稳定入口 `https://lieguoji-web.pages.dev/`。最终旧版 main CI 260 单测／60 浏览器通过，HTTPS 最终复核 4/4，详见本地 `.autopilot/final-release-0.4.0.json`。

这不是按 V4 新 PH 做成的独立游戏版本。V4 文档、规划和门禁修改当前只存在本地，未上传。
