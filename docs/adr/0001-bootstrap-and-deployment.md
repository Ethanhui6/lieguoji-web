# ADR 0001：空目录补缺与部署选择

日期 2026-09-23；状态：工程已选择，Cloudflare Pages原生Git项目已创建，部署类型已锁定。

现场根目录空白。仅按用户明确提供的 Downloads 文件路径读取执行文档并复制到根目录，未搜索 Downloads 或其他项目。无规划 ZIP可解压。保留 v3 与 confirmed 设定，另建测试大陆，不冒充旧规划完成品。
采用 TypeScript 6.0.3 + React 19.3 + Vite 8 + PixiJS 8；TypeScript 7 与 typescript-eslint peer 范围冲突，因此选兼容 6.0.3，不强制忽略依赖错误。Node 固定为本机 24.18.1。

Pages使用原生Git集成。用户已完成GitHub CLI与Cloudflare登录，当前App已获目标私有仓库Ethanhui6/lieguoji-web访问；未扩大授权。已创建Pages lieguoji-web，生产main，构建npm run build:cf，输出dist，根目录项目根，NODE_VERSION=24.18.1，构建系统版本3。
首次部署12758757-0b83-4f21-a99e-63029431d006来自已通过真实CI的main提交5e5dcb1335e878a53cadb1d632af5714dd5e21b9。平台返回并实际打开https://lieguoji-web.pages.dev/；后续世界工坊先分支预览与CI再合并。无部署Secret、Direct Upload或其他生产链。
只允许一条自动生产链。当前 CI 仅做检查；原生 Pages 与 GitHub E2E 非天然串行，因此生产分支只接收同一提交已通过 CI 和预览的受控合并。

原生项目已锁定，不再使用Direct Upload备选，也不为本地CLI过期而创建重复项目。以后若改部署方式，需要单独评估并保持唯一生产链。

官方依据（实施时读取）：
- https://developers.cloudflare.com/pages/configuration/git-integration/
- https://developers.cloudflare.com/pages/get-started/direct-upload/
- https://vite.dev/guide/
- https://pixijs.com/8.x/guides/getting-started/quick-start
