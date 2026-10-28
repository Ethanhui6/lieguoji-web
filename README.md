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

## iOS 自签安装

没有 Mac 也可以装到自己的手机。Actions 里的 **iOS unsigned IPA** 只在你手动运行时，用 GitHub 的 macOS 机器打出一个未签名的 `.ipa`。你再用自己的自签工具重签、安装。不需要 Apple 开发者账号，也不会上传 App Store。网页正式站的 Cloudflare Pages 部署不变。

1. 打开本仓库的 Actions，选 **iOS unsigned IPA**，点 **Run workflow**。选要打包的分支（合并进 `main` 之后一般选 `main`）。推送代码不会自动跑这一步。
2. 运行变绿后，在该次运行页面底部下载产物 `lieguoji-unsigned-ipa`，解压得到 `lieguoji-unsigned.ipa`。
3. 用你现有的自签工具打开这个 `.ipa`，换成你自己的证书和描述文件。桌面上的名字是「列国纪」。占位 Bundle ID 是 `app.lieguoji.game`；工具里可以改成你自己的标识，避免和手机上别的应用撞名。
4. 装到手机后，若系统提示开发者不受信任：打开 **设置 → 通用 → VPN 与设备管理**（有的系统写「描述文件与设备管理」），信任你的证书，再打开应用。

应用把当次网页构建打进安装包，打开地图不需要网络。存档在本机。云存档仍然要联网。

占位 Bundle ID 写在 `capacitor.config.json` 的 `appId`。改完后重新跑上面的工作流（工作流会执行 `npm run ios:sync`，把标识写进 Xcode 工程）。工作流拒绝带 Apple 证书的包。不要把证书、描述文件或私钥放进仓库。

横屏和竖屏都可以。画面铺满屏幕，刘海和底部横条沿用网页已有的安全区留白。

## 目录
- `src/fms` 游戏：地图编辑与生成（FmsApp）、文化世界与推演（`play/`，culture47 引擎运行在 Web Worker）。
- `src/world` 地形与渲染基础模块。
- `tests` Playwright 浏览器测试。
- `scripts` 构建产物检查、密钥扫描、原作数据提取工具。
- `docs` 原作移植说明与部署说明。
