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

## iOS

手机上玩的是 `ios-native/` 里的 SwiftUI / Metal 原生版，不是 Capacitor 网页壳。当前原生版本 **0.26.3（build 75）**。更新说明在 [ios-native/docs/RELEASE-0.26.3.md](ios-native/docs/RELEASE-0.26.3.md)，应用里「更新」页也能看到这一版改了什么。网页正式站仍由 Cloudflare Pages 部署 `main`，和这个原生包不是同一个版本号。

没有 Mac 也可以装到自己的手机。Actions 里的 **iOS Native unsigned IPA**（`ios-native-unsigned.yml`）打出未签名的 `.ipa`。你再用自己的自签工具重签、安装。不需要上传 App Store。

1. 打开本仓库的 Actions，选 **iOS Native unsigned IPA**，点 **Run workflow**，选要打包的分支。这个工作流在拉取请求上经常因为分支名对不上而跳过，推送也不一定会跑，需要手动运行。
2. 运行变绿后，在该次运行页面底部下载产物 `lieguoji-native-unsigned`，解压得到 `lieguoji-native-unsigned.ipa`。同一次运行若开了截图，产物 `lieguoji-screenshots` 是模拟器画面，不是真机验收。
3. 用你现有的自签工具打开这个 `.ipa`，换成你自己的证书和描述文件。桌面上的名字是「列国纪」。Bundle ID 是 `com.lieguoji.native`。
4. 装到手机后，若系统提示开发者不受信任：打开 **设置 → 通用 → VPN 与设备管理**（有的系统写「描述文件与设备管理」），信任你的证书，再打开应用。

原生包在本机推演和画地图，打开地图不需要网络。存档在本机「文件」里的「列国纪」。连电脑计算时才需要和电脑在同一网络。

横屏和竖屏都可以。地图铺满屏幕。切到后台时，进行中的世界会写入本机存档。

仓库里还留着旧的 Capacitor 工程（`ios/`、`capacitor.config.json`，网页 0.5.x 那条安装说明）。那不是现在要装的原生版。不要把证书、描述文件或私钥放进仓库。

## 目录
- `src/fms` 游戏：地图编辑与生成（FmsApp）、文化世界与推演（`play/`，culture47 引擎运行在 Web Worker）。
- `src/world` 地形与渲染基础模块。
- `tests` Playwright 浏览器测试。
- `scripts` 构建产物检查、密钥扫描、原作数据提取工具。
- `docs` 原作移植说明与部署说明。
