# Cloudflare 部署

| 项目 | 值 |
| --- | --- |
| GitHub 私有仓库 | https://github.com/Ethanhui6/lieguoji-web |
| Cloudflare Pages 项目 | `lieguoji-web`（原生 Git 集成） |
| 正式站 | https://lieguoji-web.pages.dev （main 分支） |
| 构建命令 / 输出 | `npm run build:cf` / `dist` |
| Node | 24.18.1 |

## 流程
1. 本地完成版本：测试、试玩、提升版本号、写 CHANGELOG.md。
2. `git push origin main`。pre-push 检查 lint、类型、构建、产物白名单和密钥扫描。
3. Cloudflare Pages 自动构建并发布 main。官方构建限时 20 分钟，因此 `build:cf` 不跑全量单测。
4. GitHub Actions 对同一提交运行 `npm run check:full`（含全量单测）和 Playwright 浏览器测试。
5. 用 `gh api repos/Ethanhui6/lieguoji-web/commits/<sha>/check-runs` 查看「Cloudflare Pages」与 Actions 结果；线上 `/build.json` 的 `version` 与 `commit` 应与本次发布一致。

只发布 `dist`；docs、源码分析资料、存档与认证信息不进入 dist。
