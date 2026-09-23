# Cloudflare Pages 部署

实际项目为 `lieguoji-web`，生产地址为 [https://lieguoji-web.pages.dev/](https://lieguoji-web.pages.dev/)。部署类型已确定并接通 **Pages 原生 Git 集成**：main 自动生产，其余分支自动预览，是本项目唯一自动生产部署链。未创建 Direct Upload 项目或 Actions 生产上传链。

## 当前配置与版本

| 配置项 | 实际值 |
| --- | --- |
| Cloudflare 账户 | `0dccd3742e707d4f6506f2de668e516e` |
| Pages 项目 | `lieguoji-web` |
| GitHub 私有源仓库 | [Ethanhui6/lieguoji-web](https://github.com/Ethanhui6/lieguoji-web) |
| 生产分支 | `main` |
| 预览分支 | 所有非生产分支 |
| 根目录 | 项目根 |
| 构建系统 / Node | 版本 3 / `24.18.1` |
| 构建命令 | `npm run build:cf` |
| 构建输出 | `dist` |
| 本次功能验收代码 | `048c30e9cff6e3e3649d7984101f9291a6e5ff04` |
| 本次功能验收部署 ID | `f28b6d49-ca2e-49ad-910a-4f61671c161e` |
| 固定生产部署 URL | [https://f28b6d49.lieguoji-web.pages.dev/](https://f28b6d49.lieguoji-web.pages.dev/) |

2026-09-23 已在官方控制台完成登录、核实账户及项目；GitHub 浏览器与 CLI 已验证个人账号 Ethanhui6。现有 Cloudflare GitHub App 已能访问目标仓库，无需新增访问授权。该原生集成使用平台连接，**不需要 GitHub Actions 单独的部署 Secret**；本地网页登录不作为 Actions 的凭证。没有读取认证配置/令牌或修改其他项目。

PR #1 已通过修复后 CI 和分支预览核实后合并；功能验收时 main 的 [真实 CI](https://github.com/Ethanhui6/lieguoji-web/actions/runs/35834288962) 已通过 100 单测与 30 浏览器场景，0 flaky。[分支预览](https://f9a36f2d.lieguoji-web.pages.dev/)对应提交 `0af3210a1e1cd54551d7d23c59c4cc9ed10f2fc9`，部署 ID `f9a36f2d-81bd-4843-b97c-c4d77a02919a`，HTTPS 冒烟 4/4 通过。

本次生产 HTTPS 首轮 26/30，4 项失败已定位为测试对 304 MIME 元数据及 Worker 初始化时序处理不完整。仅修正测试后，同一生产部署的全部 15 项战役用例以 `--retries=0` 补测通过；加上首轮通过的 15 项工坊/保护用例，**30 个不同线上场景均已覆盖通过，非单次线上 30/30**。详见 [云端证据](evidence/2026-09-23-cloud.md)，首轮失败 trace 与原始结果保留。

## 唯一生产流程

`build:cf` 依次执行计划校验、lint、类型检查、单元测试、生产构建及产物检查；GitHub CI 另运行真实 Playwright E2E。任何检查失败先修复，不跳过检查取得绿灯。

1. 在开发分支完成实现与本地检查，创建指向 main 的 PR。
2. 核对当前 PR head、实际测试合并提交、CI 结果和 Pages 分支预览；有失败、flaky 或版本变化时先解决并重新验证。
3. 检查通过后受控合并。当前免费私有仓库分支保护 API 返回 403，未声称已有强制门禁，不购买套餐或公开仓库。
4. Pages 由 main 的 Git 事件自动生产构建，只发布 `dist`；合并后的 main CI 再次运行。Pages 构建和 Actions E2E 并非天然串行，因此不能依赖合并后的 CI 来阻止已经启动的生产构建。
5. 使用平台返回的真实部署 ID 和 HTTPS URL 验证版本 SHA、地图和交互、资源/Worker、深链接刷新、控制台及保存恢复，记录失败和修复后的证据。

当前默认入口是世界工坊，验收需覆盖手画/生成大陆→国家→城市首都→开始自建推演→保存刷新。旧战役入口 `/?demo=1` 和 `/campaign/test` 继续回归。`build.json` 的 entry、scenarios、commit 必须对应实际部署，不用本地 URL 代替 HTTPS 证据。

不得整包发布根目录；docs、plan、references、真实存档及认证资料不可进入 dist。后续复用本项目和既定部署类型，不混用 Direct Upload，不改 DNS、不购买服务、不删除旧资源。手机/平板仿真与真实手机验收分开报告。

以上 SHA 和部署为本次功能验收记录。后续仅文档/测试的检查点合并仍会触发新构建；收尾后的实际 HEAD、生产 SHA 和检查结果记录在本地忽略文件 .autopilot/checkpoint.json。续接须读取线上 build.json，并查询 GitHub Cloudflare Pages check 获取最新部署，不把本次验收 SHA 当作永远不变的最新版本。
