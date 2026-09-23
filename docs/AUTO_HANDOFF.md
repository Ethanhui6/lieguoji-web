# 自动接管检查点

记录日期：2026-09-23（Asia/Hong_Kong）。任务源 plan/tasks.json，当前批 M3-001/002/003，版本 0.3.0 / 新规则 0.2.0。续接先核对本文件、忽略目录 `.autopilot/checkpoint.json`、Git 实际状态和线上 build.json，不从头重建。

## 实际工程与发布链

- 项目：D:\游戏\架空地图模拟器。首次为空目录，原 v2 包、100 项任务与正式地图仍缺失；未扫描其他项目。现有补缺计划不冒充原规划。
- 当前工作分支 feat/statecraft，功能提交 049e6d6d103f3b4402964c0823a545aa7595b950，PR https://github.com/Ethanhui6/lieguoji-web/pull/14。基于已验收 main 262bd7630344d2f0a68604485d7c4395375a291c；当前文档所在提交只补测试挂载等待及真实预览证据，尚未合并或发布 M3。
- 本人 GitHub 账号 Ethanhui6，私有仓库 https://github.com/Ethanhui6/lieguoji-web，origin 已验证。M3 对应 Issue #11/#12/#13、里程碑 M3 #4；不得重复创建。
- Cloudflare 账户 0dccd3742e707d4f6506f2de668e516e，Pages 项目 lieguoji-web。唯一原生 Git 链：main 自动生产、其他分支预览；构建 npm run build:cf，输出 dist，根目录，Node 24.18.1。
- 实际地址 https://lieguoji-web.pages.dev/。当前已验证生产仍为 262bd76 / 0.2.0，部署 f9b31a44-e8b2-4117-9e50-fcc7334b6d8a，固定地址 https://f9b31a44.lieguoji-web.pages.dev/。上一 main CI https://github.com/Ethanhui6/lieguoji-web/actions/runs/35836349984。本批云端证据将在实际检查后更新。
- GitHub App 已有本仓库访问权限；没有 Direct Upload 或 Actions 部署链，不需要 Actions 部署 Secret。当前没有待完成登录或授权。
- 免费私有仓库分支保护接口实际 403；保持私有与免费，以同提交 CI、分支预览通过后受控合并。不声称服务器强制保护，不升级、不公开、不绕过已有保护。

## 已实现与实际检查

M0/M1/M2 已发布：工程与 Worker、地图交互、真实战役闭环、版本化存档，以及 640 单元海陆/地形编辑、连续地形/下坡河流、国家与城市首都、撤销重做、草稿与独立自建推演。旧验收见 docs/evidence/2026-09-23-cloud.md 和 2026-09-23-world-studio.md。

M3 三项已实现，本地检查通过、云端待验收，详见 docs/adr/0003-statecraft.md 与 docs/evidence/2026-09-23-statecraft.md：

- 地方人口粮库、民军分配政策、有限驻军补给、饥荒后果、实控变化与守恒日账；界面区分预计需求和已经发生的结算。
- 新世界和平开始，宣战/停战影响真实路径、交战、追击与占领；保护十日，停战保留当前路段进度，再真实撤离；无安全路时等待。
- 桌面/手机/平板国家簿、可解释 AI、Worker 权威快照与过期确认保护、旧自建局独立经营副本。
- 完整 build:cf 通过：21 计划、lint、类型、163/163 单测、生产构建、22 个游戏产物检查；三种地图各连续推演 90 日，逐日守恒和确定性通过。
- 修复手机保存提示遮挡决策按钮后，新增国家操作 6/6 与原功能/旧档保护 33/33 均首次通过、0 重试、0 flaky、0 跳过。报告 `.autopilot/m3-ui-final-results.json`、`m3-regression-results.json`。首轮 4 通过/2 手机失败证据保留，未用强制点击掩盖问题。
- 已实际查看桌面、手机和平板截图，核心移动按钮至少 44px、抽屉可滚动、无横向溢出。Pixel 7/iPad Chromium 是仿真，不是真机或移动 Safari。
- 功能版 HTTPS 预览 https://82f717dd.lieguoji-web.pages.dev/，实际 build.json 匹配049e6d6。首轮39场景37通过/2外交测试同步失败；trace确认刷新加载页被误判桌面，补充等待真实布局后，同站6/6经营外交重验通过。原33其他场景已通过，合计39不同场景覆盖；不是单次39/39。报告m3-preview-results.json与m3-preview-ui-recheck-results.json，最终head仍需CI与预览确认。

## 存档兼容与操作

旧 World schema1 / rules0.1 / envelope1 继续原规则，不静默升级；新 schema2 / rules0.2 / envelope2 明确含经营外交数据。工坊草稿与历史索引保持 schema1。未知内外层或经营版本锁写，保留 SHA256、备份与 revision/CAS 保护。

旧自建局进入国家簿，可明确确认「创建经营推演副本」；副本使用新 run 和独立数据库，保留日期、地图、军队、路段与旧事件，沿用旧局敌对关系。人口和粮库是新规则初始参数，不冒充过去收支。三设备 E2E 验证原库逐槽字节不变。固定旧档仅为合成测试样本，来源见 tests/fixtures/README.md。

Node 24.18.1，npm ci；npm run dev；npm run check。首次 Playwright 需 npx playwright install chromium。本机预览 http://127.0.0.1:4173/，复用前查 build.json，不终止陌生进程。默认工坊；旧战役 /?demo=1 或 /campaign/test。草稿 `.world.json`、推演 `.save.json`；跨网址存储不共享，通过导入导出迁移。

## 待完成与下一步

本批下一步：审查提交内容 → 推送 feat/statecraft → 同 head 的真实 CI 与原生 Pages 预览 → HTTPS 核心闭环 → 受控合并 → 核对生产 SHA 与线上行为 → 完成任务证据。不能拿上一版本 CI 或本地构建冒充当前云端通过。

随后 M4 先拆分历史记录、可验证回放与独立分支，再处理皇室模拟；现在最多 160 条近期事件不能充当完整历史。贸易、跨省运粮、海军、谈判、皇室、历史回放、第一次长征和 PWA 未实现。

ACCEPT-MAP、原规划 M2-PLAN 仍 blocked；真 iPhone/Android、低端设备长局与正式轮廓人工核验待验，不阻塞独立沙盒工程。第一次长征仍依赖正式地图和确认剧情，不能杜撰。

普通工程、依赖、提交、检查和本项目免费部署已授权。只有新增身份选择、登录/App 授权、秘密输入或危险操作才由本人介入；不读取认证配置、不索要聊天令牌。所有资源先查后复用，只发布 dist。

会话结束后不声称继续后台开发；续接从实际检查点继续。
