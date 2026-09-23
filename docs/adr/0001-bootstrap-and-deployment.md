# ADR 0001：空目录补缺与部署选择

日期 2026-09-23；状态：工程已选择，云端创建待身份核实。

现场根目录空白。仅按用户明确提供的 Downloads 文件路径读取执行文档并复制到根目录，未搜索 Downloads 或其他项目。无规划 ZIP可解压。保留 v3 与 confirmed 设定，另建测试大陆，不冒充旧规划完成品。
采用 TypeScript 6.0.3 + React 19.3 + Vite 8 + PixiJS 8；TypeScript 7 与 typescript-eslint peer 范围冲突，因此选兼容 6.0.3，不强制忽略依赖错误。Node 固定为本机 24.18.1。

Pages 优先原生 Git 集成。浏览器工具可用，已打开 Cloudflare 控制台但跳转登录；CLI OAuth 过期。未创建 Pages 项目，不抢先使用 Direct Upload。
待登录后查询个人账户/项目类型和 GitHub 仓库，用户确认目标仓库的 GitHub App 权限后自动填写 build:cf / dist / main / Node 24.18.1。
只允许一条自动生产链。当前 CI 仅做检查；原生 Pages 与 GitHub E2E 非天然串行，因此生产分支只接收同一提交已通过 CI 和预览的受控合并。

若浏览器授权后确认无法安全完成原生集成且没有已锁定项目，才重新评估 Direct Upload + Actions。其本地 OAuth 不等于 CI Secret，且同项目不可切换为 Git 集成。

官方依据（实施时读取）：
- https://developers.cloudflare.com/pages/configuration/git-integration/
- https://developers.cloudflare.com/pages/get-started/direct-upload/
- https://vite.dev/guide/
- https://pixijs.com/8.x/guides/getting-started/quick-start
