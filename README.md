# 列国纪（iOS）

Fantasy Map Simulator 的 iOS 原生复刻：生成或绘制地图，建立多文化国家与城市，观察各国自主发展、外交、战争、叛乱与家族兴衰。SwiftUI 界面 + Metal 地图，推演在手机本地完成，不需要网络。

当前版本 **1.10.1（build 109）**。每版改了什么，在应用的「更新」页里看。当前续接与未完成事项见 [补全记录](docs/CODEX_COMPLETION_2026-11-10.md)。

## 安装（不需要 Mac）

GitHub Actions 的 **iOS Native unsigned IPA**（`.github/workflows/ios-native-unsigned.yml`）在每次推送 `main` 时打出未签名的 `.ipa`，也可以在 Actions 页面手动 **Run workflow**。

1. 运行变绿后，在运行页面底部下载产物 `lieguoji-native-unsigned`，解压得到 `.ipa`。
2. 用自己的自签工具换上你的证书和描述文件后安装。Bundle ID 是 `com.lieguoji.native`，桌面名字「列国纪」。
3. 若提示开发者不受信任：**设置 → 通用 → VPN 与设备管理**，信任证书后再打开。

同一次运行还有：
- `lieguoji-screenshots`：模拟器自动巡览截图（不是真机验收）。
- `lieguoji-server-windows`：电脑计算服务器（Windows）。手机通过配对码经中转连上电脑，由电脑推演、手机显示。

存档在「文件」App 的「列国纪」文件夹。不要把证书、描述文件或私钥放进仓库。

## 目录

| 路径 | 内容 |
|---|---|
| `ios-native/App` | SwiftUI 界面、游戏状态、自动截图巡览 |
| `ios-native/Render` | Metal 地图渲染、军队棋子、战场效果 |
| `ios-native/Core` | Swift 推演引擎 `LieguojiCore`、电脑计算服务器 `LieguojiServer`、单元与对照测试 |
| `ios-native/Resources` | 地图数据、原作素材、字体、名称目录、音乐、打包好的推演引擎 `Engine/engine.js` |
| `ios-native/project.yml` | XcodeGen 工程描述（版本号在这里） |
| `src` | 推演引擎的 TypeScript 源码（culture47），打包成 `engine.js`，并生成 Swift 对照测试的数据 |
| `functions/api/relay`、`relay` | 电脑计算的中转（Cloudflare Pages 函数 + Worker） |
| `docs` | 原作移植分析、素材授权说明、第三方许可 |

## 开发

```bash
npm ci
npm run check
```

- `npm run check`：引擎源码的 lint、类型检查、单元测试。
- `npm run engine`：重新打包 `ios-native/Resources/Engine/engine.js`。
- Swift 部分（引擎测试、应用编译、截图）在 GitHub Actions 的 macOS / Linux 机器上跑。
