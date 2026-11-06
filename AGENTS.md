# 列国纪执行规则

列国纪是用户自有作品 Fantasy Map Simulator（安装目录 `D:\steam\steamapps\common\FantasyMapSimulator`）的 iOS 原生复刻。以原作为参照，但画面与玩法可以按用户要求优化，不必逐像素照搬。用户消息优先于本文件。报告用中文。

## 原作素材
- 用户已授权只读分析该安装目录，并在本项目中适配其中的代码、数据和资源（见 docs/FMS_PACKAGE_REUSE_2026-10-03.md）。
- 安装目录只读；不读取认证、SDK 配置（如 gameConfigDyV2.json、envs.log）或个人存档。
- 反汇编、dump 和分析中间产物只放在 `.autopilot/fms-audit`（已忽略），不提交。

## 版本流程
1. 每个版本提升 `ios-native/project.yml` 的 MARKETING_VERSION 与 CURRENT_PROJECT_VERSION，并在 `ios-native/App/LieguojiApp.swift` 的 ReleaseNotes 顶部写中文更新说明。
2. 推送 `main`。pre-push 检查仓库地址、工作区干净、新增内容的密钥扫描、引擎源码 lint 与类型。不得跳过 hook。
3. 推送后 GitHub Actions（ios-native-unsigned.yml）跑 Swift 测试、打包未签名 IPA 和模拟器截图；看截图确认后把运行链接告诉用户。
4. 不改写已推送的历史，不删除用户数据。

## 代码约定
- Swift：SwiftUI + Metal；推演引擎 `ios-native/Core/LieguojiCore`，对照测试数据在 `Core/Tests/LieguojiCoreTests/Golden`（由 `src/native-export` 生成）。
- TypeScript：`src` 只保留推演引擎（culture47），`npm run engine` 打包成 `ios-native/Resources/Engine/engine.js`。
- 模拟必须确定性可重放；改动规则后新建世界即用新规则。
- 不提交秘密；不改动其他项目。
