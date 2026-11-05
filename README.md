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

## 原生 iOS（SwiftUI + Metal）

目录 `ios-native/`：列国纪的 **原生客户端**（SwiftUI + Metal 地图，不嵌 WKWebView 游戏）。当前原生版 **0.27.1（build 75）**，说明见 [`ios-native/docs/RELEASE-0.27.1.md`](ios-native/docs/RELEASE-0.27.1.md)。

### 构建与安装

1. 推送分支（或合并进 `main`）后，在 Actions 手动跑 **iOS unsigned IPA**（不会在 push 时自动跑）。
2. 运行变绿后下载产物 `lieguoji-unsigned-ipa`，解压得到 `lieguoji-unsigned.ipa`。
3. 用自签工具换成你的证书与描述文件后安装。桌面名「列国纪」；Bundle ID 默认 `com.lieguoji.native`（见 `ios-native/project.yml`）。
4. 若系统提示不受信任：设置 → 通用 → VPN 与设备管理，信任证书后再打开。

工程由 `ios-native/project.yml`（XcodeGen）生成。CI 还会跑截图 tour（`LGJ_SHOT=1`），产物 `lieguoji-screenshots`。

与网页版并存：Cloudflare Pages 仍部署网页；原生改动不修改 `src/` 游戏引擎。iOS 独有的简化特质（改革家、船舶大师等）只在原生 Swift 核心、且 `enableAppRules` 开启后生效。

### 本地（需 macOS）

```bash
cd ios-native
xcodegen generate   # 或按仓库脚本
open Lieguoji.xcodeproj
```

横竖屏均可；地图 Metal 铺满，UI 走纸面／宣纸风格。存档在本机 Documents。

## 目录
- `src/fms` 游戏：地图编辑与生成（FmsApp）、文化世界与推演（`play/`，culture47 引擎运行在 Web Worker）。
- `src/world` 地形与渲染基础模块。
- `tests` Playwright 浏览器测试。
- `scripts` 构建产物检查、密钥扫描、原作数据提取工具。
- `docs` 原作移植说明与部署说明。
