# 当前续接：新局、自定义、模式点击与手动跨海运输已可试玩

更新2026-10-06。用户最新直接要求优先修bug、补关键玩法；本地玩法例外继续有效。根目录主任务独占写入，子agent只读。按plan/tasks.json.webRebuild续接，不恢复旧国家行政顺序，不重复写规划。

## 源码、入口与存档

- 分支codex/ph06-world-generation；a84fe06为创世/自定义，当前功能源码及已检构建 **674921dfe50521da079aa48997ca9e21f94ac7d5**。其后可能仅证据状态提交，先git status/log核实。
- **http://127.0.0.1:5181/?fms=1**，最终刷新标签25已保留、暂停。入口“进入世界→继续运输版第10日”。5180开发；127.0.0.1非手机公网。
- v7/fms-transport-1，指纹 **f72161fb53c2f4a3e31dea36c1ba764150ef0a35e462ce6d42a33ff5d7dae7ae**；Store9/lieguoji-fms-transport-v1。
- run fms-b200cd87-2d06-44df-ab68-f61dd481e037，day10 14:24/tick1272/rev6/checksum66b2be927ecace22fa54b0e24c6b87014ff37d494a66d3a75ff4b3727e9843c3。东岚/首都临海/#fdb462；临海步兵已运至金阳登陆再撤回五岛，返岸补员300，旧AI再次调动，当前暂停。
- 旧围城Store7 run fms-e739c162-3a95-4297-bc7c-4ecd8f1a255b/day39/tick4715/rev4/checksum9aea2f57a3349520438c792248c569f69ff182bf8b0053fb1c26105c60dbf180未变。旧标签不强制刷新；标签24仍有此前正在运行的试玩，本轮未替用户暂停/保存它。

## 完成的有限切片

- WEB-04-14：小轮廓固定合并预算故障修复；6国开局、真实改名/国色/保存刷新；政治/军事拾取与选目标分离；小军旗、真实pulse反馈、短动画。用户具体开局错误未给，不能说排除所有原因；极小世界兵源与战争平衡未验。
- WEB-04-15：同港登船→真实海路→抵岸确认登陆，外交重验、不瞬占、乘员日粮和损失、编制上限、独立存档、未来嵌套字段锁写。UI实际100临海步兵→金阳港、海上保存刷新→登陆→撤回五岛。
- 证据 **docs/evidence/fms-creation-customize-v5-2026-10-06/DELIVERY.md**、unit-final.json（16文件166测试，修正测试夹具后的11项运输定向复测通过）、checks.json、browser.json、console.json、两张截图。lint/typecheck/build、15计划/22发布策略测试、plan:check通过。不是全仓库/自动E2E/云端CI全绿。
- 428×926 Chromium仿真无横溢出/面板可滚动/reduced-motion0s，真机和用户视觉pending。FmsApp644.81kB chunk警告保留。

## 后续不可破坏

- **f72161fb已有实际运输档，改绑定规则前先完整封存当前入口/内核并注册旧版运行分派。不能只改hash锁掉试玩，不能静默迁移。**
- occupation1归档747f与creation1归档76107bed完整复算；旧14kernel/runtime/session/naval逐字guard保留。v7用独立transport-runtime/editor-session，旧v6按原规则。
- Store1—8不写，复制新runID独立库；CAS/主备原子保存/先查未来字段再恢复保留，不提交真实存档/安装包dump。
- 原作港口/海路来源见docs/evidence/fms-naval-v5-2026-10-05/DELIVERY.md；1000人/船、6点日粮等是网页适配，不冒充拆出原作数值。
- 原安装目录D:/steam/steamapps/common/FantasyMapSimulator仅只读；不读认证/SDK配置/个人存档、不运行完整原作或恢复脚本、不写安装目录。

## 下一批

1. WEB-04-08：只读核实原作海战/敌我/损失撤退，做可玩海军交锋；AI跨海远征另分真实计划/登船/登陆规则。当前没有自动组织跨海战争。
2. WEB-04-13：持久围攻效率与补给，对照完整/残军/城防耗时，先归档f72161fb；继续解决节奏和平衡。
3. WEB-04-11多军战线、更多地图入口、玩家永久托管后续单独实现。现有普通玩家军令结束后AI仍可能再调动。

海战/封锁/AI远征、完整政体/家族/信仰未完成；第一份真机/用户视觉门仍pending。

## 发布锁

旧唯一链GitHub Ethanhui6/lieguoji-web → Cloudflare Pages lieguoji-web，main生产/其他分支预览；旧站https://lieguoji-web.pages.dev/保持，本轮未查询或变更云端。所有新版本仅本地。全部PH/真机/视觉发布门与pre-push不变：**禁止push分支/tag、远程PR/Issue/Milestone、上传、Pages触发**。普通本地工作已授权；不能声称会话结束后仍后台开发。
