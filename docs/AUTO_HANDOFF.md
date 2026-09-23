# 自动接管检查点

## 正在执行的 M4 批次（恢复时先读）

当前分支 feat/history-replay，基线 main/a25321b17c8d4292d92646ab40d48cfb341b0405；正式站仍为 0.3.0，不能把本地 0.4.0 当成已发布。M4 Issue #16/#17/#18 已查询后创建，复用 M4 里程碑 #5。决策 docs/adr/0004-history-replay.md。

本地已接入历史核心、独立原子存储、模拟/回放 Worker、记录副本/时间轴/分支/只读归档，并修复独立审查指出的启动失败锁、异步导航、移动历史选择器与模态穿透。完整build:cf通过260单测/23产物；浏览器首轮54/60，6项为新建后全库容量断言错误。修正测试后全部12故障+3回放运行检查15/15，无重试/跳过；60个不同场景已有通过证据，非单轮60/60。详见docs/evidence/2026-09-23-history.md。下一步提交后核验真实CI与Pages分支预览，才受控合并及生产HTTPS验收。M4-001/002/003仍pending_acceptance，M4-004皇室保留todo，M4里程碑不提前关闭。

普通旧局与新历史库分离：run-h UUID / lieguoji-history-v1；单历史 2048 输入 / 20 MiB，总 current+backup 200 MiB；记录只从当前日开始，源档不改。导入原包是只读归档，继续须分支。内容指纹来自 sim/history 核心，不使用 Git SHA。当前无所需授权，生产链仍为原生 Git。以下为上批 M3 已验收证据，不代表 M4 状态。

记录日期：2026-09-23（Asia/Hong_Kong）。0.3.0 国家经营与基础外交已发布，任务源 plan/tasks.json；详细证据 docs/evidence/2026-09-23-statecraft.md。续接先核对本文件、Git 工作区/远端与线上 build.json，不从头重建。

## 实际工程与发布链

- 项目：D:\游戏\架空地图模拟器。首次为空目录，原 v2 包、100 项任务与正式地图仍缺失；未扫描其他项目。补缺计划不冒充原规划。
- 功能实现提交049e6d6d103f3b4402964c0823a545aa7595b950，测试同步修复6b4d87edca09ff872d0aaf7badebdca2e8004db6；PR https://github.com/Ethanhui6/lieguoji-web/pull/14 已受控合并，已验收生产提交b4f85b572450fdc2b49ef1ad1a6a220f13f67ac6。
- 本交接在docs/statecraft-release分支只更新计划与证据，不改游戏源码/配置/测试/产物。其提交/合并会触发同功能的后续原生部署；最新准确HEAD、CI与部署ID另存忽略文件.autopilot/checkpoint.json，恢复时仍须查询实际状态，避免自引用提交SHA。
- 本人GitHub账号Ethanhui6，私有仓库https://github.com/Ethanhui6/lieguoji-web，origin已验证。M3对应Issue #11/#12/#13均附证据并关闭，里程碑M3 #4已关闭；查询后复用，不重复创建。
- Cloudflare账户0dccd3742e707d4f6506f2de668e516e，Pages项目lieguoji-web。唯一原生Git链：main自动生产，其他分支预览；构建npm run build:cf，输出dist，项目根目录，Node24.18.1。
- 实际游玩地址https://lieguoji-web.pages.dev/。功能验收部署527ee9de-8356-4467-8f2f-e4472c3fe30c，固定地址https://527ee9de.lieguoji-web.pages.dev/；正式build.json已匹配b4f85b5/0.3.0，规则0.2.0、兼容0.1.0。
- GitHub App已具有本仓库访问权限；无Direct Upload、无Actions部署链，不需要Actions部署Secret。当前无待完成登录或授权。
- 免费私有仓库分支保护接口实际403；保持私有/免费，以同提交CI与预览通过后受控合并。不声称服务器强制保护，不升级、不公开、不绕过保护。

## 已完成与证据

M0/M1/M2已发布：工程与Worker、交互地图、真实战役闭环、版本化存档；640单元海陆/地形编辑、连续地形/下坡河流、国家/城市/首都、撤销重做、草稿与独立推演。早期验收见docs/evidence/2026-09-23-cloud.md与2026-09-23-world-studio.md。

本批M3-001/002/003提供：

- 地方人口粮库、有限驻军补给、民军分配政策、饥荒后果、实控变化与守恒日账；预计需求和实际结算分别显示。
- 新世界和平起步，宣战/停战约束路径、交战、追击与占领；十日保护，在途路段保留进度后真实撤离，无安全路时等待。
- 桌面/手机/平板国家簿、可解释自主决策、Worker权威预览与过期确认拒绝；旧自建局明确确认后建立独立经营副本。
- build:cf完整通过：21计划、lint、类型、163单测、生产构建与22个严格白名单产物。三种地图各90日逐日守恒与确定性通过；独立边界审查覆盖中立军队、第三国路线与有限驻地供给。
- 本地最终新增6/6、原功能/旧局保护33/33首次通过；首轮手机提示遮挡已实际修复，失败截图保留，没有force点击。
- 最终PR CI https://github.com/Ethanhui6/lieguoji-web/actions/runs/35843219490：163单测、39浏览器首次全过，0重试/flaky/跳过。实际测试merge SHA556b251f422371f04a36f7c01fd490dd71c42c3b、artifact10741484459。旧CI35842316166的1flaky保留，未作为合并依据。
- HTTPS首轮37/39；2个外交测试在刷新加载页误判布局。trace确认后只补测试挂载等待，同功能站6/6重验通过。最终head6b4d87e预览https://df8cec7d.lieguoji-web.pages.dev/，15/15核心场景首次全过，才合并PR14。
- 正式站b4f85b5：18/18核心浏览器场景首次通过，0重试/flaky/跳过。包括三种布局下手画大陆→地形→建国/首都→推演→保存刷新，经营/外交/旧局副本，以及战役、Worker/JS MIME、控制台、深链接、地图手势。报告.autopilot/m3-production-results.json，截图m3-production-e2e。
- 合并后main CI https://github.com/Ethanhui6/lieguoji-web/actions/runs/35843788634 已核验实际checkout b4f85b5：163单测与39浏览器首次全过，0失败执行/重试/flaky/跳过，artifact10742178957。上述M3三项据此完成验收；后续交接提交仅文档，不改变游戏版本内容。
- 产物护栏27隔离检查通过（1允许/26拒绝），未知JSON、存档样本、密钥扩展、异常目录和链接被拒绝，真实dist逐文件hash不变。文件symlink fixture因Windows EPERM未实测；junction/hardlink已实测。未读认证配置，合成测试存档不进入dist。

## 存档与复现

旧World schema1/rules0.1/envelope1继续原规则，不静默升级；新schema2/rules0.2/envelope2含经营外交。草稿/历史索引仍schema1。未知内外层/经营版本锁写，保留SHA256、备份、revision上限与多标签CAS保护。

旧自建局在国家簿选择「创建经营推演副本」，确认后用新run和独立数据库，保留日期、地图、军队、路段和原事件，沿用旧局敌对关系。人口粮库为明确的新规则初值，不冒充过去实际收支。三种布局验证源数据库逐槽字节不变。测试样本来源见tests/fixtures/README.md。

Node24.18.1；npm ci，npm run dev，npm run check。首次浏览器环境需npx playwright install chromium。本机预览http://127.0.0.1:4173/，复用先查build.json，不终止陌生进程。默认工坊，旧战役/?demo=1或/campaign/test。草稿.world.json，推演.save.json；不同网址不共享IndexedDB，跨网址通过导入导出迁移。

## 下一批与边界

M4按最多三项推进，详细验收先写入plan/tasks.json：可校验的历史输入/检查点 → 独立只读回放 → 从历史时点建立独立分支。保存规则实现指纹、成功输入序号与状态hash，拒绝损坏/未来格式；回放不能写当前局，分支不能覆盖源局。旧局只能从明确开始记录的当前日期建立记录副本，不能补造没有保存的过去。当前最多160条近期events不等于完整历史。

皇室目前仅有身份引用，不推断CANON未确认人物/亲属/继承。贸易、跨省运粮、海军、谈判、征募、皇室模拟、历史回放、第一次长征与PWA未实现。正式地图与原规划仍缺，ACCEPT-MAP/M2-PLAN继续blocked；第一次长征依赖正式地图及剧情确认。

桌面Chrome、Pixel7和iPad均为Chromium仿真。真实iPhone/Android、移动Safari、低端设备长局和正式轮廓人工核验待验；不阻塞独立沙盒开发。

普通工程、依赖、提交、检查和本项目免费部署已获授权。新增身份选择、登录/App扩权、秘密输入或高风险操作才由本人介入；不读取认证配置、不索要聊天令牌。所有资源先查后复用，只发布dist。会话结束后不声称仍在后台开发。
