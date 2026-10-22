# 列国纪

Fantasy Map Simulator 的网页 / 手机复刻：绘制或生成地图，建立多文化国家与城市，观察各国自主发展、外交、战争、叛乱与家族兴衰。

- 在线游玩：https://lieguoji-web.pages.dev
- 版本日志：[CHANGELOG.md](CHANGELOG.md)
- 部署说明：[docs/DEPLOY_CLOUDFLARE.md](docs/DEPLOY_CLOUDFLARE.md)

## 本地运行

```bash
npm ci
npm run dev
```

常用命令：`npm run lint`、`npm run typecheck`、`npm test`（全量单测，较慢）、`npm run build`、`npm run test:e2e`。

## 目录
- `src/fms` 游戏：地图编辑与生成（FmsApp）、文化世界与推演（`play/`，culture47 引擎运行在 Web Worker）。
- `src/world` 地形与渲染基础模块。
- `tests` Playwright 浏览器测试。
- `scripts` 构建产物检查、密钥扫描、原作数据提取工具。
- `docs` 原作移植说明与部署说明。
