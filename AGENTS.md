# 列国纪执行规则

列国纪是用户自有作品 Fantasy Map Simulator（安装目录 `D:\steam\steamapps\common\FantasyMapSimulator`）的网页/PWA 复刻。一切以原作为准：原作怎么做，网页就怎么还原。用户消息优先于本文件。报告用中文。

## 原作素材
- 用户已授权只读分析该安装目录，并在本项目中适配其中的代码、数据和资源（见 docs/FMS_PACKAGE_REUSE_2026-10-03.md）。
- 安装目录只读；不读取认证、SDK 配置（如 gameConfigDyV2.json、envs.log）或个人存档。
- 反汇编、dump 和分析中间产物只放在 `.autopilot/fms-audit`（已忽略），不提交、不进 dist。

## 版本流程（2026-10-22 起）
用户要求：每做完一个新版本，就统一上传 GitHub，由 Cloudflare Pages 自动部署到正式站，用户直接在手机上体验；上传后继续做下一版。
1. 在 main 分支本地开发；改动涉及的单元测试通过，并在浏览器中实际试玩确认。
2. 提升 package.json 版本号，在 CHANGELOG.md 顶部写本版本的中文日志（新增、修改、修复、已知问题）。
3. 提交后推送 main。pre-push 会检查：仓库地址、工作区干净、lint、类型、生产构建与产物白名单，并对推送新增的全部内容做密钥/隐私路径扫描。不得跳过 hook。
4. Cloudflare Pages（原生 Git 集成，构建命令 `npm run build:cf`，输出 dist）自动部署 main；推送后用 `gh api repos/Ethanhui6/lieguoji-web/commits/<sha>/check-runs` 确认 Cloudflare Pages 成功，再告诉用户。GitHub Actions 对同一提交运行全量单测和浏览器测试，结果另行报告。
5. 不改写已推送的历史，不删除用户数据。

## 存档
从 0.5.0 起只支持当前版本创建的世界；旧版本存档不再读取。以后若引擎改动导致旧档不兼容，在 CHANGELOG 中写明。

## 代码约定
- TypeScript / React / Vite / PixiJS；模拟在 Web Worker（culture47 引擎），存档在 IndexedDB。
- 模拟必须确定性可重放（journal：开局 + 操作）；改动规则后新建世界即用新规则。
- 不提交秘密；不改动其他项目。
