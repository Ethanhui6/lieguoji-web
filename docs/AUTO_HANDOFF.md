# 当前续接：Fantasy Map Simulator 网页重建 V5

更新：2026-10-04 香港时间 02:25 heartbeat 批次，约 02:50 保存检查点。每次先核实 Git，再读 CODEX_AUTOPILOT_V5.md 和 plan/tasks.json.webRebuild。当前只按 V5 执行，旧 tasks/phaseState/programme 是完整要求和历史账，不提供开发顺序。

## 当前进度与下一批

**WEB-PH01 的独立绘图底座已实现并通过限定工程检查；当前 WEB-PH02，下一项 WEB-02-01 保形自然化。** 不重写规划、不重复恢复已完成数值函数，不转入国家/行政/家族/信仰。

- 用户目标：授权原作 Fantasy Map Simulator 的网页/PWA，忠实绘图流程、原作地图与工具风格；原作风格已替代旧 iOS 美术方向。
- 首份完整体验仍未交付：空白海洋 → 轮廓/海陆绘制 → 保留主体并细化湾岬与内陆 → 连续缩放 → 修改撤销保存恢复。当前可以手绘和恢复，但自然地形尚未接入，视觉相似度没有用户认可。
- iPhone13ProMax、用户报告 iOS27、Safari 与 Chrome、竖屏优先、折叠工具；具体系统构建号留待真机。当前 428×926 Chromium 布局和合成触摸检查不代表真机/WebKit。
- WEB-PH02 首份真机/用户视觉门均保持未通过；不依赖门的绘图、地理、表现和性能工程可以继续。
- 已有 heartbeat v5 每30分钟续接，香港时间 **2026-10-04 08:00 截止**。到期先保存检查点，不开新批；执行依赖本地 Codex 可用，不把后续调度当完成。

## Git、构建和发布锁

- 项目 D:/游戏/架空地图模拟器，分支 codex/ph06-world-generation。
- 本批起点 cbb0a68144dcee83ac0a10e01cdd86d5a113dfff；绘图源码提交 **36bd1ac1f127fc48d5716ee9bbf4c902607c4bae**。本文件和证据在后续本地 checkpoint 提交；最终 HEAD 用 git log -1 --oneline 核实，避免自引用 SHA。
- 本地 dist 已按上述源码提交重建并用真实浏览器打开。build.json commit=36bd1ac1f127fc48d5716ee9bbf4c902607c4bae；SHA256 **38e5b2ce80c1af1f6714cc98c5e7792d3e46e1b71cfd0799ff137fec18ce3a96**。版号保留 0.5.0-preview.33，表示本地开发切片，不能冒称新正式发行。
- 旧产品源码基准42af5433aedcb0e02cbcb1cabf88aa538f184c1a及旧发行验收保留；旧dist已被本地验证构建替换，旧云端站点未更新。
- 本轮核实 remote=https://github.com/Ethanhui6/lieguoji-web.git，core.hooksPath=.githooks。既有 Pages 项目 lieguoji-web，唯一原生 Git 链 main 生产/其他分支预览；历史 URL https://lieguoji-web.pages.dev/ ，本批未联网核验或发布。
- **禁止所有 push/tag、远程 PR/Issue/Milestone、上传及 Pages 触发。** 9月24单次试玩例外已消耗，releasePolicy/pre-push不变。V5阶段完成不会解锁旧全部PH门，不能另建发布链。
- 旧61任务/36PH/144子项、除webRebuild外所有原JSON顶层字段对比本批起点保持一致；CANON、正式核图正史、旧档、长征与云端CI结果均不自动通过。

## 本地可运行入口

- 开发服务本次启动于 **http://127.0.0.1:5180/?fms=1**，进程 session 65287；本地 dist 预览 **http://127.0.0.1:5181/?fms=1**，session 55887。续接要先查是否仍运行，不盲目另开占用端口；它们不是公网/手机试玩 URL。
- 没有 ?fms=1 仍是旧世界工坊。新入口在 main 惰性分流，未先挂载 RootApp/创建旧640草稿。入口代码 src/fms/FmsApp.tsx；旧入口仅封装至 src/LegacyEntry.tsx。
- 独立数据库 **lieguoji-fms-web-v1**。5180 验证草图最终 revision6、9985陆点；5181测试保存 revision1、1362陆点。都是本批测试数据，不是正式设定或用户真实存档。浏览器不同 origin 的存档不同，不自动迁移。
- 旧4173保存 atlas-17708eca-a8dc-465b-9763-8f82a1539ca6未打开或覆盖；原临时服务是否还在运行须现场核实。

## 本批实现和证据

详见 [绘图底座报告](evidence/fms-drawing-entry-2026-10-04/DRAWING_ENTRY.md)、[浏览器状态记录](evidence/fms-drawing-entry-2026-10-04/browser-checks.json)、[源码/构建验证](evidence/fms-drawing-entry-2026-10-04/verification.json)。

- 网页源拓扑与高程直接Mesh显示；轮廓、陆地、擦海真实改高程，半径/目标高度可调；不是原Unity拓扑或完整原作算法。
- 单指绘图/平移、双指导航、第二指落工具区取消；超长、自交等明确反馈。提交前只显示笔迹预览，参数逐笔冻结。
- 整笔撤销/重做；独立存档CAS、防损坏备份、未来版本锁写，保存后刷新恢复。撤销栈仅当前会话，不随刷新保留。
- WebGL丢失立即锁绘图/历史/导航，保留保存；刷新可恢复。生产CSP缺少Pixi no-eval adapter的实际失败已修复，原安全策略没有修改。
- 原作参照浅色紧凑工具、折叠高度面板，428×926无横向溢出，按钮至少44px；视觉方向仍待用户验收。

## 已执行检查及证据边界

- 4文件121/121：模型10、手势6、存档37、恢复内核68；Vitest 02:40:43开始、684ms。整体lint/typecheck通过，最后仅no-eval import补丁后针对renderer ESLint通过，另修复选中工具悬停对比度并实际截图复验。
- 本地生产构建/产物白名单通过，37个允许游戏产物；提交绑定构建重新打开，FMS chunk加载且存档恢复一致，未加载LegacyEntry。旧入口另外实测正常启动。
- 真浏览器鼠标加陆/切水道、撤销重做、保存刷新、多标签拒绝覆盖、WebGL失效保存与恢复通过。开发与修复后的生产页控制台无warn/error。
- 多指、轮廓、超长取消使用DOM合成PointerEvent；Input.dispatchTouchEvent工具不支持。测试临时替换pointer capture并立即还原，真实鼠标另验。没有iPhone/Safari/Chrome真机通过，没有原作运行等价证明。
- **没有自动自然化、真实山系水系、原海洋Shader、完整LOD或最终大地图规模。** 当前平顶大陆的细锯齿/折角仍可见，保留为下一阶段问题，不包装成最终效果。
- 本批没有云端CI、HTTPS上线验收、push或部署。原发布门仍锁定。

## 下一批直接开发

1. WEB-02-01：以当前FmsDocument海陆/高程为约束，锁大轮廓、主要湾岬和狭颈，生成真实可编辑内部地貌。复用已恢复的纯高度核时保留原作证据边界；先给可取消、可确认的候选结果，接同一撤销/保存合同。
2. 生成计算与编辑显示分离，考虑worker与取消/陈旧结果丢弃；当前笔刷主线程的桌面结果不能替代手机性能。不要把候选地图转旧Atlas再强制显示，WEB-02-02另做同输入对照。
3. WEB-02-02再完善海岸海洋、连续缩放及显示/拾取一致性；WEB-02-03由用户真机与视觉确认。门未过只继续绘图改进。

## 原作材料与历史

只读指定 D:/steam/steamapps/common/FantasyMapSimulator，不写目录、不读认证/SDK/envs.log/个人存档，不运行原EXE/DLL或recovered main。raw/dump仍只在ignored .autopilot/fms-audit，不提交、不入dist。本批未继续读取安装包。

已完成数值内核与参照基线见 docs/evidence/fms-brush-numeric-2026-10-04/verification.json、docs/FMS_REFERENCE_BASELINE_2026-10-04.md；不重复恢复GetHeightMap/SetCellAsSea。未知仍包括原Collider、活动UI参数、原拓扑、Unity RNG/powf逐位、海洋Shader/LOD及完整模拟。按具体绘图切片遇到的必要未知再继续有界恢复。
