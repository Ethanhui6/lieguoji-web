# 自动接管检查点

记录日期：2026-09-23（Asia/Hong_Kong）。0.2.0 世界工坊基础版已发布。任务源为 plan/tasks.json，工程与云端验收分别见 docs/evidence/2026-09-23-world-studio.md 和 2026-09-23-cloud.md。

## 当前实际状态

- 项目：D:\游戏\架空地图模拟器。首次为空目录，原 v2 包、100 项任务和正式地图仍缺失；未扫描其他项目。现有补缺计划不冒充原规划。
- 功能生产提交：048c30e9cff6e3e3649d7984101f9291a6e5ff04，main，PR #1 已合并。世界工坊实现始于 8b707ca，暂停交互修复为 0af3210。交接收尾仅修浏览器测试与文档，不修改游戏源文件或资源。
- 本地工作分支：feat/world-creator。当前文档所在提交就是后续检查点；续接先运行 git status、git rev-parse HEAD、git fetch 并核对 origin/main。忽略文件 .autopilot/checkpoint.json 会记录收尾后的实际 HEAD、生产 SHA 和检查结果，避免自引用提交哈希。
- GitHub 个人账号：Ethanhui6。私有仓库 https://github.com/Ethanhui6/lieguoji-web，origin 已验证；PR https://github.com/Ethanhui6/lieguoji-web/pull/1 已合并。M0—M6 共 7 个里程碑和当前 8 项任务 Issue 已建立，按任务 ID 去重维护。
- Cloudflare 账户 ID：0dccd3742e707d4f6506f2de668e516e。Pages 项目 lieguoji-web，唯一原生 Git 集成。main 自动生产，其他分支自动预览；构建 npm run build:cf，输出 dist，项目根目录，Node 24.18.1。
- 实际游玩地址：https://lieguoji-web.pages.dev/。功能验收生产部署 f28b6d49-ca2e-49ad-910a-4f61671c161e，固定地址 https://f28b6d49.lieguoji-web.pages.dev/，SHA 048c30e。后续仅文档/测试的检查点合并仍会触发原生部署，应从 build.json 和 GitHub Cloudflare Pages check 查询当前 SHA，不猜测地址。
- 已实际观察分支推送自动预览、main 合并自动生产。没有 Direct Upload 或 GitHub Actions 部署链，不需要独立 Actions 部署 Secret。现有 GitHub App 已有本仓库访问权限，当前无待完成登录或授权。
- 免费私有仓库的分支保护接口返回 403 要求升级或公开；保留私有和免费范围，使用同提交 CI 与分支预览通过后的受控合并。不得声称服务器已强制保护，也不得为此购买或公开源码。

## 已完成与验收

- M0：工程、交互地图、Worker、桌面/手机/平板仿真、真实 GitHub CI 和 HTTPS 持续发布均已完成；正式核图与真机单列待验。
- M1：旧五国测试战役的选择军队、军令预览确认/取消、行军补给、交战、撤退/占领、查看原因和保存刷新闭环可玩。
- M2-001：640 单元海陆与地形笔刷、种子大陆、连续地形/下坡河流、完整笔触撤销重做、草稿保存恢复。
- M2-002：手工国家名称颜色及归属、自动分国、保留手工疆域补全空地、手动/自动城市首都、双岛同国、实体引用与首都校验。
- M2-003：自建地图编译进入真实 Worker，基础军事自主决策、暂停干预军队；草稿/每次推演/旧战役分别保存，跨 run 导入不覆盖当前局，缺档链接不假造世界。
- 真实 main CI：https://github.com/Ethanhui6/lieguoji-web/actions/runs/35834288962，SHA 048c30e。计划校验、lint、类型检查、100/100 单元测试、构建/产物检查、30/30 浏览器场景均通过，浏览器首次通过、无 flaky。
- 正式 HTTPS 共 30 个不同场景覆盖通过：首轮 15 个工坊/隔离保护场景全部通过；旧战役模块修正测试同步与 304 缓存 MIME 判断后，15/15 全部通过、0 重试。保留首轮 26 通过/4 失败记录，没有把两次结果写成单次 30/30。重跑同时保留错误 MIME、网络失败及原存档字节不变检查。
- 线上证据：.autopilot/production-results.json、production-recheck-results.json 及对应 *-e2e 目录。桌面 Chrome、Pixel 7、iPad 为桌面或设备仿真；不是实机测试。
- 入库前审查源文件和已有历史，常见凭证模式未匹配；.env、.wrangler、私钥、真实存档/草稿导出、ZIP、.autopilot 均忽略。仅 dist 游戏产物公开，规划资料不随站点发布。

## 未完成和下一批

正式原地图/原规划未提供，ACCEPT-MAP 与 M2-PLAN 保持 blocked。真 iPhone/Android、低端真机长局性能和正式轮廓人工核验仍待人工验收；不依赖这些事项的工程可以继续。

当前编辑精度为 640 地理单元，AI 为基础军事决策；完整外交、经济、皇室、历史分支回放、第一次长征和 PWA 未实现。没有海上运输，相隔海洋不生成军队通路。玩家自建世界和测试大陆不能自动转为正式世界。

下一批 M3 按 1—3 项细分并实现：人口/粮食/供给因果、和平战争与外交约束、可解释自主决策。先规则和实际操作，再扩面板。原规划取得后差异合并，第一次长征仍依赖正式核图与剧情确认。

## 续接与存储

1. 读本文件、plan/tasks.json、AGENTS.md，核实 Git 工作区、远端和线上 build.json，不从头重建。
2. 普通工程、依赖、提交、检查和本项目免费发布已获授权。需要新增账户选择、GitHub App 扩权或高风险操作时再交给本人；不得读取配置提取凭证，不索要聊天密码/令牌。
3. 先查询再复用 Issue、里程碑与 Pages 项目；正常分支提交、PR 同提交检查与预览通过后合并 main，不强推。只保留现有原生 Pages Git 生产链。
4. npm ci；npm run dev；npm run check。首次浏览器环境需 npx playwright install chromium。本机 http://127.0.0.1:4173/ 仅为预览进程；复用端口前检查 build.json，不终止陌生进程。
5. 默认工坊；旧战役 /?demo=1 或 /campaign/test。草稿 .world.json，推演 .save.json。工坊导入推演分配独立 run；模拟内只接受同 run。不同网址/浏览器源不共享 IndexedDB，跨源使用导入导出。版本锁写、多标签 CAS、坏档备份和操作锁不得删掉。

会话结束后不声称继续后台开发；本机预览进程不代表后台开发。恢复本任务时从核实后的检查点继续。
