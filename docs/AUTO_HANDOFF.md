# 当前续接：Fantasy Map Simulator 网页重建 V5

更新：2026-10-04香港时间05:20有界海岸微细化检查点。先核实Git，读取CODEX_AUTOPILOT_V5.md、plan/tasks.json.webRebuild和本文件；接续实际代码，不从头重写计划，不重复已有恢复。旧tasks/phaseState/programme保留历史，不决定当前开发顺序。

## 当前位置

**WEB-PH02 / WEB-02-01仍in_progress。** 海岸真实网格细化、显式位移上限、玩家锁、整步撤销和保存已接通；但每父面一次微细化过于保守，固定旧交点仍呈折线海岸，**尚未达到自然海湾/岬角的观感**。不能以1,178新增点、275测试或微细化按钮宣布本项完成。接下来处理有用的轮廓连续性/可见细节，不重做保护、旧档矩阵或仅写新计划。

目标iPhone13ProMax，用户报告iOS27，Safari/Chrome，竖屏、原作风格、折叠工具。首份真机和用户视觉门未过，不扩建国家、行政、家族、信仰。heartbeat v5每30分钟续接；**香港时间2026-10-04 08:00截止，到期保存检查点，不开始新批。** 只报告已执行工作，不声称会话后自行后台开发。

## 本批实际变化

- 独立海岸Worker与“最大偏移”0—4地图单位（默认0）；原混合三角内插h20点，变为3个子面。原点/高程/原边交点固定。与沿海内陆低地宽度分开，不是材质装饰。
- 最终float32点验证位移上限、双方局部面积各≤2%、子面正面积余量；玩家锁触及的父面全部跳过；精确20、无足够海陆支撑的细部跳过。主线程预览与确认分别重验，取消/超时不迟到提交。
- 换网格仍同worldId时重建渲染缓冲，派生缓存绑定几何。整网格历史拥有深拷贝、保护版本不降、锁长度跟随网格；点数50k和历史100步/250k点预算保持，新增64MiB保守负载估算（非实际手机内存）。
- 浏览器发现新增h20点导致假暗岸，已修复为不参与旧点坡度、插值父面shade。修复前后截图均保留；实测旧点shade不变，不承诺任意旧h20地图相对旧renderer逐像素一致。
- 相关14文件275/275测试、整体lint/typecheck、测量脚本ESLint、48组独立父面裁剪/非网格线剖面/保护/阴影、源码绑定build与39产物检查通过。未跑全套旧游戏测试或云端CI。
- 开发浏览器预览→对照→取消→再确认revision20→撤销21→重做22→保存storedRevision11→刷新完整数据一致；36,864→38,042点，590锁点保留，原高程/交点/锁面不改。最大偏移0.07957713220689326，局部陆面积最大1.9511%、海0.73135%。
- 生产构建Worker在严格CSP下生成316段候选，取消刷新旧checksum不变，warn/error为0。只桌面Chromium CDP428×926、鼠标/键盘，不是iPhone、WebKit、原作等价或用户视觉通过。

本批：[报告](evidence/fms-coast-refinement-2026-10-04/COAST_REFINEMENT.md)、[48组量测](evidence/fms-coast-refinement-2026-10-04/measurements.json)、[实际存档几何](evidence/fms-coast-refinement-2026-10-04/browser-geometry.json)、[浏览器](evidence/fms-coast-refinement-2026-10-04/browser-checks.json)、[生产](evidence/fms-coast-refinement-2026-10-04/production-browser.json)、[指纹](evidence/fms-coast-refinement-2026-10-04/verification.json)。

## Git、产物与发布锁

- D:/游戏/架空地图模拟器，codex/ph06-world-generation，批起点1f24fbf；最终源码**176f396701104ccd3f1e23a5e5132f46918a3f9e**。证据与本文件单独checkpoint提交，当前HEAD请git log -1核实。
- dist绑定176f396701104ccd3f1e23a5e5132f46918a3f9e；build.json SHA256 **ffa070044975118b9d9a028cc0e2323f03223195b18aae7a1bcfa1ee43959b86**，39允许产物，coast.worker-DHvxhpb0.js。版本0.5.0-preview.33是本地切片基线，不是完成度。
- 只读核实remote=https://github.com/Ethanhui6/lieguoji-web.git，hooksPath=.githooks。既有Pages lieguoji-web，唯一原生Git链main生产/其他分支预览；历史URL https://lieguoji-web.pages.dev/ 本批未联网核实/更新。
- **禁止push/tag、远程PR/Issue/Milestone、上传和Pages触发。** 9月24例外已消耗，发布锁/pre-push/CSP不改，不另建部署链。V5完成不自动解除旧全部PH门。
- plan仅webRebuild更新；其余顶层字段与1f24fbf完全相同。旧61任务/36PH/144子项、CANON/核图正史/长征保留。

## 本地入口和测试数据

- 开发 http://127.0.0.1:5180/?fms=1 （session65287）；产物预览 http://127.0.0.1:5181/?fms=1 （session55887），续接先核实存活。不是公网/手机可访问URL。
- FMS惰性独立入口，不挂RootApp/LegacyEntry，不建旧640草稿。命名空间lieguoji-fms-web-v1，名称不变，两个测试origin均DB2。
- 5180文档v2 revision22/storedRevision11/590锁/38,042点，checksum=8dfa2df19c06820b149c16ddd55a9be1e338b66b03f41273fe91511f717ce831。5181仍v2 revision3/storedRevision4/371锁/36,864点，checksum=d69deaf68e526d74277fc10562f5d69bebabcfac70d884509d43bd879a37ce69。
- 均人工工程测试图。旧4173 atlas-17708eca-a8dc-465b-9763-8f82a1539ca6未打开/覆盖。开发IAB标签7留handoff，生产临时标签18关闭；临时尺寸覆盖复位；测试完整网格仅ignored .autopilot，不入Git或dist。

## 继承的保护与边界

- 用户指出的backup恢复归档缺口已在5f56088修复；本批继续运行DB1 current损坏/缺失×beforeProtection不存在/已有的四路径二次v2保存回归，不重复修改persistence.ts。首次v2保存和DB2升级同事务，beforeProtection来自有效current??backup，归档不覆盖；CAS/失败原子/阻塞放弃不迟到仍通过。无手动归档恢复按钮。
- 普通自然化fms-shape-preserving-relief-v4保持当前h20线性海岸0位移，包括新微细化后的海岸。旧v1已经保存的收缩不自动恢复。沿海低地宽度1%—20%、默认3.5%，按短边比例且有1.8平均点距下限；属于内陆过渡，不移动海岸。详见[前批宽度证据](evidence/fms-coastal-width-2026-10-04/COASTAL_WIDTH.md)。
- 本批微细化小岛/细颈保护只是两层采样支撑，3×3岛与三行颈有真实非零变化，受位移/双方2%面积约束；不能称全部小岛细颈固定。h20结点防止重复漂移；本次会话可撤销，刷新后改海岸需笔刷。
- 水文是图上priority-flood/汇流/湖深网页适配，不是原作气候侵蚀；新增点会重算，当前每点单位汇流非面积加权降雨。模拟接入前要冻结水文版本与尺度合同。加载/编辑/预览验证仍含主线程工作，手机性能未知。
- 当前1536单位、36,864基础点不是最终大图；本次7.4/12.4倍观察不冒充4/16/40倍完整验收。海岸折线、河线折角、简单海洋仍明显；真实手机与用户视觉待验。

## 下一批直接开发

1. 继续WEB-02-01：处理较大尺度折角和可见海湾/岬角细节，沿用本批保形/玩家锁/保存和失败证据。不能只加点、调整颜色或放宽阈值判成功；新方法须量化实际轮廓和面积、宽湾/细颈/长岬/小岛。
2. 前置完成后才开始WEB-02-02同输入/种子/相机直接源地形与Atlas对照，定位源算法/重采样/材质并完善浅海/河口/湖边/4/16/40倍连续过程；不强制回旧Atlas。
3. WEB-02-03真实iPhone13ProMax Safari/Chrome触控/性能/视觉由用户验收；继续其前不依赖人工的绘图工程。当前无新登录授权需要，发布冻结。

## 材料范围

只读授权D:/steam/steamapps/common/FantasyMapSimulator；不写安装目录、不读认证/SDK/envs.log/个人存档、不运行原EXE/DLL/恢复脚本。本批没有读取新安装材料。raw/dump留ignored .autopilot/fms-audit，不提交、不入dist。
参照与数值见docs/FMS_REFERENCE_BASELINE_2026-10-04.md、docs/evidence/fms-brush-numeric-2026-10-04/verification.json。绘图底座36bd1ac、旧产品基准42af5433保留。不重复恢复GetHeightMap/SetCellAsSea；原Collider/活动UI参数/拓扑/Unity RNG逐位/海洋Shader/LOD/完整模拟仍未知，按具体下一切片有界恢复。
