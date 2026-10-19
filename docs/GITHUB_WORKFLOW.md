> **冻结段已被主计划取代（2026-10-19）。** 当前流程见 [MASTER_PLAN.md](MASTER_PLAN.md)：往 `codex/ph06-world-generation` 的 PR 跑一档，往 main 的 PR 跑二档。Actions 仍只检查，不另建部署链。文中「当前云端写入冻结」保留为历史。pre-push 本批不改。

# GitHub 检查与受控合并

## 2026-10-09 继续修复后的候选检查

`vite.config.ts` 的单测文件并发统一为1，与当前完整串行复验的 `--maxWorkers=1` 一致。`npm test`、`build:cf`、Cloudflare原生构建和Actions因此采用相同并发配置；全部用例、原超时和实际Worker断言保留。此前并发2的完整运行有7项5秒超时，原阈值隔离35项通过；本次完整串行结果仍须等真实执行完成，不能由修改配置推定通过。

当前浏览器收集为59文件、411项：三个设备各137项。两个已有512桌面场景在手机和平板跳过，合计4项；完整执行成功应记录407 passed / 4 skipped，而不是411 passed。新增继续及恢复42项自然包含在完整运行中。最终聚合要求的是全部CI任务成功，现有4个明确的场景跳过不伪装成已测试。

外部本机产物测试必须同时指定 `GAME_BASE_URL` 和 `GAME_BUILD_DIR`；种子地图与旧引擎兼容测试核对实际服务的build.json及其对应资源。候选的构建时commit和构建文件SHA分别记录，不能把后来源码提交号写成旧产物内的commit。完整运行后再绑定有界预览授权，不能以411项收集成功冒充执行通过。

## 2026-10-08 当前候选的检查结构

用户重新明确授权本次同一开发分支的GitHub＋Pages手机试玩，边界见 [本次预览授权](GITHUB_UPLOAD_2026-10-06.md)。main与正式发行门保持；下方历史M4结果不能当作本次CI结果。

此前单个任务把全部设备浏览器流程串行执行，实际旧run 37488428210已因3小时上限取消。本批保留完整检查，改为build任务先执行npm run build:cf并上传唯一已验dist；browser矩阵按desktop/mobile/tablet各分两片、每片workers=1，下载该次构建返回的artifact-id，严格要求下载校验摘要一致。最终Application checks依赖build和整个browser矩阵，任何失败、取消或跳过都不通过。Actions仍只检查，不另建上传Cloudflare的部署链。

新增下载Action固定为 actions/download-artifact v8.0.2，SHA `9000827ccba6bdab643e8b6fd33ac0654aef8333`；已核对官方标签与该提交action.yml，使用artifact-ids、merge-multiple、digest-mismatch:error。来源：[固定版本定义](https://github.com/actions/download-artifact/blob/9000827ccba6bdab643e8b6fd33ac0654aef8333/action.yml)。现有其他Action SHA、依赖锁、测试断言与完整文件集合保留。build和每片浏览器上限180分钟，分片不共用本机上下文或存档，所有报告按SHA/attempt/设备/分片分别保存。

当前仍为本地候选，远端是否通过须上传后核对真实run与SHA；本地结果和workflow文件本身都不等于云端CI已通过。

以下为历史记录，云端冻结的本次有界例外以上述授权为准。

> **当前云端写入冻结。** 用户要求PH00—PH35全部完成并验收前不上传GitHub/Cloudflare，包含任意分支push、PR/Issue/Milestone与artifact。允许本地提交与测试。下面的既有CI和受控合并流程只在 [V4发布门](RELEASE_POLICY_V4.md) 解除后适用；不删除已有检查或另开发布链。

本文件对应 `.github/workflows/ci.yml`。仓库为本人私有的 [Ethanhui6/lieguoji-web](https://github.com/Ethanhui6/lieguoji-web)，唯一生产部署由 Pages 原生 Git 完成，Actions 负责检查而不向生产上传。

## 本批 M4 记录

| 项目 | 已核验结果 |
| --- | --- |
| 功能 PR | https://github.com/Ethanhui6/lieguoji-web/pull/19 |
| 功能实现提交 | `8d716dda2c92373c62f87aef700c3d93984c4472` |
| 首屏地图测试修正 | `f33bb991bbbddc814849d8564ca571d431a65e67` |
| 先前 main 基线 | `a25321b17c8d4292d92646ab40d48cfb341b0405` / 0.3.0 |
| 最终 PR CI | `https://github.com/Ethanhui6/lieguoji-web/actions/runs/35868873630` |
| CI 实际测试合并提交 | `075dce9f6b48c34bf8d0d647cb337c265b52af3b` |
| 最终分支预览 | `https://0100487d.lieguoji-web.pages.dev` |
| 已验收生产功能提交 | `d60098f13087c43d4c0d6970f6450b24c8364ac3` |
| 合并后生产 CI | `https://github.com/Ethanhui6/lieguoji-web/actions/runs/35870297239` |

首个真实 PR run https://github.com/Ethanhui6/lieguoji-web/actions/runs/35867427462 在实现版本上取得 260 单测与 60 浏览器首次全过；不能替代测试修订后的当前 head 验证。首个 HTTPS 预览 23/24，首屏地图就绪等待修正后定向 6/6，详见 [M4 验收证据](evidence/2026-09-23-history.md)。本地和线上首轮失败均保留，CI 与 HTTPS 结果分开报告。

M4 任务 Issue #16/#17/#18 复用里程碑 #5，三项 Issue 已随真实发布验收附证据关闭。M4-004 皇室尚待实现，M4 里程碑保持开放。完整任务映射以 `plan/tasks.json` 为准。此前 PR/运行信息保留在 [M3 证据](evidence/2026-09-23-statecraft.md) 和 [早期云端证据](evidence/2026-09-23-cloud.md)，不冒充本批状态。

## 实际检查

- 面向 main 的 PR 和推送到 main 触发检查；同一 PR/分支的新检查取消过时运行。
- GitHub 托管 `ubuntu-24.04`，Node.js 固定 `24.18.1`；唯一任务 `Application checks`，20 分钟上限。
- 顺序执行 `npm ci`、`npm run build:cf`、`npx playwright install --with-deps chromium`、`npm run test:e2e`。
- `build:cf` 执行计划校验、lint、类型、单元测试、Vite 构建及产物白名单。没有 `continue-on-error` 或跳过缺失检查的选项，失败先修复。
- 浏览器检查通过后上传 `dist/`，名称含 `github.sha`，保留 7 天；失败时保留 Playwright 报告和测试结果。检查尚未执行时不会凭空产生报告。
- 日志记录实际检出提交。PR 默认测试 GitHub 合并引用，需要同时核对 head、base 和实际测试 SHA；不能混用不同提交的成功结果。

CI 仅有 `contents: read` 权限。checkout 不持久保存凭证，不使用 `pull_request_target`，不读取部署 Secret。上传范围仅为明确的构建与检查输出，禁止项目根目录、参考资料和真实存档。

## 固定 Action 版本

2026-09-23 已通过公开 GitHub 官方 API 查询 release/tag 提交并核对相应 `action.yml`。配置固定完整 SHA，注释版本仅用于阅读；更新时重新核验，不将本次核验当作未来最新版本。

| 官方 Action | 已核实版本 | 完整提交 SHA | 官方核验来源 |
| --- | --- | --- | --- |
| `actions/checkout` | `v7.0.1` | `3d3c42e5aac5ba805825da76410c181273ba90b1` | [发布](https://github.com/actions/checkout/releases/tag/v7.0.1) · [Git 引用 API](https://api.github.com/repos/actions/checkout/git/ref/tags/v7.0.1) · [固定版本定义](https://github.com/actions/checkout/blob/3d3c42e5aac5ba805825da76410c181273ba90b1/action.yml) |
| `actions/setup-node` | `v7.0.0` | `820762786026740c76f36085b0efc47a31fe5020` | [发布](https://github.com/actions/setup-node/releases/tag/v7.0.0) · [Git 引用 API](https://api.github.com/repos/actions/setup-node/git/ref/tags/v7.0.0) · [固定版本定义](https://github.com/actions/setup-node/blob/820762786026740c76f36085b0efc47a31fe5020/action.yml) |
| `actions/upload-artifact` | `v7.0.1` | `043fb46d1a93c77aae656e7c1c64a875d1fc6a0a` | [发布](https://github.com/actions/upload-artifact/releases/tag/v7.0.1) · [Git 引用 API](https://api.github.com/repos/actions/upload-artifact/git/ref/tags/v7.0.1) · [固定版本定义](https://github.com/actions/upload-artifact/blob/043fb46d1a93c77aae656e7c1c64a875d1fc6a0a/action.yml) |

工作流语法依据 [GitHub 官方文档](https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax)。各批实际 run URL、提交、结论、报告/产物与失败记录写入任务表、阶段证据及交接文档。本地检查不能代替远端执行。

## 与 Pages 的关系及受控合并

原生 Git 集成已接通 `Ethanhui6/lieguoji-web` → `lieguoji-web`，main 自动生产、其他分支预览。Node `24.18.1`、构建 `npm run build:cf`、唯一输出 `dist`；[部署文档](DEPLOY_CLOUDFLARE.md) 记录真实项目和 URL。此工作流没有生产部署 job、Direct Upload 配置或部署 Secret。

免费私有仓库分支保护接口实际返回 403。保持私有/免费，以检查后的受控合并执行；不声称必需检查已由服务器强制，不购买套餐或公开仓库。

1. 提交前审查改动并完成本地检查，创建短期分支 PR。
2. 等待当前修订的 Application checks 通过，核对实际测试提交和 Pages 分支预览的版本、地图、Worker、控制台、深链接与保存恢复；本批同时验证历史回放及独立分支。
3. 合并前重查 head/base 未变化，没有失败、flaky 或待完成检查；检查过期则重新验证。不得直推游戏功能绕过检查。
4. 检查与预览通过后合并 main，Pages 原生生产构建只发布 dist。合并后 main CI 再核验，但无法作为阻止已启动 Pages 构建的天然门禁。
5. 核对实际生产提交、部署 ID、URL 与 HTTPS 场景结果，再更新任务状态。生产出现问题先停止后续发布并修复，不把页面可打开视为全验收通过。

Pages 按 Git 事件构建，Actions E2E 和 Pages 并非天然串行；平台机制见 [Cloudflare Git 集成说明](https://developers.cloudflare.com/pages/configuration/git-integration/)。普通已授权发布无需重复确认；新增登录/App 授权、账户选择、必要秘密或危险操作才交由用户。Chromium 移动仿真和 iPhone/Android 真机验收继续分开记录。
