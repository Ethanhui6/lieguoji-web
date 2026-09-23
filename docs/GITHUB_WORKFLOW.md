# GitHub 检查与受控合并

本文件对应 `.github/workflows/ci.yml`。2026-09-23 已在私有仓库 [Ethanhui6/lieguoji-web](https://github.com/Ethanhui6/lieguoji-web) 执行真实 CI；[PR #1](https://github.com/Ethanhui6/lieguoji-web/pull/1) 已受控合并，功能发布的 main 为 `048c30e9cff6e3e3649d7984101f9291a6e5ff04`。

- 修复暂停交互后的 [PR run 35833822865](https://github.com/Ethanhui6/lieguoji-web/actions/runs/35833822865)：head `0af3210a1e1cd54551d7d23c59c4cc9ed10f2fc9`，实际测试合并提交 `875a76166a4f2d3a3d246c6c05fcab572597fd9a`，100 单测、30 浏览器首次通过，0 flaky。
- 合并后 [main run 35834288962](https://github.com/Ethanhui6/lieguoji-web/actions/runs/35834288962)：实际 main `048c30e9cff6e3e3649d7984101f9291a6e5ff04`，100 单测、30 浏览器通过，0 flaky。

初始 main 的 59/15、PR 首轮 29 passed + 1 flaky 及修复过程均保留在 [云端证据](evidence/2026-09-23-cloud.md)。远端 CI 与生产 HTTPS 验收分开记录：生产首轮 26/30；4 项失败为测试 304 MIME 判断及初始化等待问题，修正测试后同一部署的全部 15 项战役补测通过，加上首轮 15 项工坊/保护，30 个不同线上场景均已有通过证据，非单次线上 30/30。后续文档/测试 PR 仍需自身检查，不把当前结果冒充尚未发生的 PR 检查。

当前账号在此私有仓库访问分支保护API返回403，明确要求升级或公开。保持仓库私有、不购买套餐，不声称设置了必需检查门禁；采用核对当前head/base及真实CI/预览后受控合并。M0—M6里程碑与M0/M2共8个任务Issue已按稳定ID创建，映射在plan/tasks.json。

## 实际检查

- 触发：面向 `main` 的 PR，以及推送到 `main`。
- 环境：GitHub 托管的 `ubuntu-24.04`，固定 Node.js `24.18.1`，与项目引擎版本一致。
- 唯一检查任务：`Application checks`。同一个 PR 或分支的新检查取消过时检查，超时上限 20 分钟。
- 按顺序执行 `npm ci`、`npm run build:cf`、`npx playwright install --with-deps chromium`、`npm run test:e2e`。
- `build:cf` 按真实 `package.json` 执行计划校验、lint、类型检查、单元测试、Vite 生产构建和构建产物检查；任一步失败会停止后续正常步骤，没有 `continue-on-error` 或跳过缺失脚本的选项。
- 浏览器测试通过后上传 `dist/`，名称含本次 `github.sha`，保存 7 天；失败时尝试上传 `playwright-report/` 和 `test-results/`，保存 7 天。若在浏览器测试前已失败，报告目录可能不存在，原始失败仍由前面的步骤保留。
- 工作流日志记录实际检出的提交。PR 默认测试 GitHub 生成的合并引用，应同时记录 PR head、base 和实际测试 SHA；不能将不同提交的检查结果混用。

CI 只有 `contents: read` 权限。检出操作不持久保存凭证；不使用 `pull_request_target`，不读取部署 Secret，不向生产环境上传。报告与产物仅来自上述明确目录，禁止把项目根目录、参考资料或真实存档加入上传路径。

## Action 的版本和来源

2026-09-23 通过不带认证的 GitHub 官方 REST API 查询各仓库 `releases/latest`，随后查询对应 tag 的 Git 引用；以下返回类型均为 `commit`。另已读取该 SHA 下的官方 `action.yml` 核对本工作流使用的输入。配置使用完整提交 SHA，版本注释仅用于阅读，升级时重新核验。

| 官方 Action | 已核实版本 | 完整提交 SHA | 官方核验来源 |
| --- | --- | --- | --- |
| `actions/checkout` | `v7.0.1` | `3d3c42e5aac5ba805825da76410c181273ba90b1` | [发布](https://github.com/actions/checkout/releases/tag/v7.0.1) · [Git 引用 API](https://api.github.com/repos/actions/checkout/git/ref/tags/v7.0.1) · [固定版本定义](https://github.com/actions/checkout/blob/3d3c42e5aac5ba805825da76410c181273ba90b1/action.yml) |
| `actions/setup-node` | `v7.0.0` | `820762786026740c76f36085b0efc47a31fe5020` | [发布](https://github.com/actions/setup-node/releases/tag/v7.0.0) · [Git 引用 API](https://api.github.com/repos/actions/setup-node/git/ref/tags/v7.0.0) · [固定版本定义](https://github.com/actions/setup-node/blob/820762786026740c76f36085b0efc47a31fe5020/action.yml) |
| `actions/upload-artifact` | `v7.0.1` | `043fb46d1a93c77aae656e7c1c64a875d1fc6a0a` | [发布](https://github.com/actions/upload-artifact/releases/tag/v7.0.1) · [Git 引用 API](https://api.github.com/repos/actions/upload-artifact/git/ref/tags/v7.0.1) · [固定版本定义](https://github.com/actions/upload-artifact/blob/043fb46d1a93c77aae656e7c1c64a875d1fc6a0a/action.yml) |

工作流语法和权限的依据为 [GitHub 官方工作流语法](https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax)。本地检查只能证明本地结果；每批远端执行后，将实际 run URL、提交 SHA、结论和失败记录写入 `plan/tasks.json`、云端证据与交接文档。不得用不同提交的成功运行替代当前代码的验证。

## 与 Pages 的关系

当前已使用 **Cloudflare Pages 原生 Git 集成**，账号与目标仓库访问已验证。此 CI 没有生产部署 job，也没有 Direct Upload 配置或部署 Secret；Pages main 自动生产、其他分支自动预览，是唯一生产链。项目为 `lieguoji-web`，构建 `npm run build:cf`、输出 `dist`、Node `24.18.1`；实际配置和生产/预览 URL 见 [部署文档](DEPLOY_CLOUDFLARE.md)。

原生 Pages 根据其自身 Git 事件构建，GitHub Actions 的 E2E 与 Pages 构建不是天然串行的。[Cloudflare 官方 Git 集成说明](https://developers.cloudflare.com/pages/configuration/git-integration/) 是连接仓库、分支部署和预览的核对入口。采用以下受控流程：

1. 在本项目短期开发分支完成一批任务，提交前审查内容并完成本地检查；创建指向 `main` 的 PR。
2. 等待当前 PR 修订版本的 `Application checks` 成功，核对实际测试提交和 Pages 分支预览。预览需验证地图、Worker、控制台、深链接与已实现的存档恢复；预览 URL 只能使用平台真实返回值。
3. 合并前确认 PR 未再变化，base 未导致测试结果过时，没有失败或待完成的必需检查。仓库套餐支持时设置必需检查和主分支保护；不支持时记录限制并坚持检查后受控合并，不直推游戏功能更新绕过检查，也不购买套餐。
4. 只在上述检查通过后合并 `main`。Pages 原生生产构建使用真实 `npm run build:cf` 和唯一输出目录 `dist`。合并后的 `main` 同时触发本工作流再次核验，但这次 CI 不能作为阻止已经启动的 Pages 构建的天然门禁。
5. 核对 Pages 生产部署的提交与实际 URL，执行线上冒烟，记录部署 ID、检查证据和未通过事项。生产若发现问题，停止后续发布并在本项目范围修复；不将页面能打开当成全部验收通过。

首次连接仓库前同样需要完成本地检查并核对部署分支。只有实际连接、首次云端检查和真实 HTTPS 验证完成后，相关任务才能从“已编写/待授权/待远端验证”改成通过。Chromium 的移动视口与触控仿真是工程证据，iPhone 和安卓真机测试继续单独记为待验收。
