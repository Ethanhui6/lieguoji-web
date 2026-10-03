# 当前续接：Fantasy Map Simulator 网页重建 V5

更新：2026-10-04香港时间夜间批次。先读 CODEX_AUTOPILOT_V5.md，核实Git，再读 plan/tasks.json.webRebuild。**当前顺序只认V5；旧tasks/phaseState/programme保留要求与历史，不决定下一批。** 普通本地工作每批1—3项自动接续，可恢复错误自行修复，不反复重写规划或重问已回答问题。

## 当前目标与执行边界

- 用户目标：授权原作Fantasy Map Simulator的网页/PWA，优先忠实绘图方式、地图、配色和工具；原作风格已替代旧iOS美术方向。
- 首份体验：空白海洋→闭合轮廓/海陆笔刷→保留主体并细化湾岬/内陆→连续缩放→修改/撤销/保存/刷新恢复。**本批完成了数值内核和参照输入基线，尚未交付这份新试玩。**
- iPhone13ProMax、用户报告iOS27、Safari与Chrome、竖屏优先、折叠工具；小版本/构建号留待真机记录。
- WEB-PH02首份体验门未通过前，只修绘图、地理、表现与性能，不扩建国家、行政、家族、信仰。真实手机与用户视觉确认分别保留，移动仿真和数值检查不能代替。
- 已实际建立本线程heartbeat v5，每30分钟续接，香港时间**2026-10-04 08:00截止**；配置已回读。到期保存检查点，不开新批。调度需要本地Codex可用，不把尚未运行的批次当完成，也不声称脱离Codex后仍在后台开发。

## Git、旧构建与发布锁

- 工作目录 D:/游戏/架空地图模拟器，分支 codex/ph06-world-generation；本批起点e9391b5，数值实现与V5检查提交 **f917dfcc52b2d355464d7c0af66eb03f98cee6b9**。随后仅补证据字节保存与交接摘要，最终checkpoint以 git log -1 --oneline 和 git status --short 核实，本文件不虚构自引用SHA。
- 旧产品源码基准42af5433aedcb0e02cbcb1cabf88aa538f184c1a；产品/旧构建0.5.0-preview.33。本批新增纯数值模块及计划检查器，尚未更新网页入口、产品版本或dist。
- 旧构建基准199f20d65cdfccff0367a9770d4516ff573e1a4c，build.json SHA256 dba141d82cb35649a927d88475ed13aca314138335e72aa0fda788aa38f989c3；旧preview.33不是已获用户认可的V5试玩。
- 本轮本地核实remote为 https://github.com/Ethanhui6/lieguoji-web.git，core.hooksPath=.githooks。历史Pages项目lieguoji-web；唯一原生Git链main生产/其他分支预览，历史URL https://lieguoji-web.pages.dev/ 。本批没有联网核验部署或更新旧站。
- **禁止所有push/tag、远程PR/Issue/Milestone、上传和Pages触发。** 9月24单次试玩例外已消耗；原releasePolicy/pre-push保留。V5阶段完成不自动解锁旧门，不得另建发布链。
- 旧61任务/36PH/144子项、全部原JSON顶层字段保留；本批任务更新限于webRebuild。CANON、正式核图/正史、旧档规则和长征要求不自动通过。

## 本批实际成果

1. [纯画笔数值模块](../src/world/fms-native-brush.ts)：Plane七种高程操作（含擦海高度0）、Hill邻接FIFO传播和五种高度合成。显式选区、邻接原顺序、注入随机源；不读取或改写旧世界。溢出/非法输入有明确网页防护。Plane擦海只恢复高度层，不代表行政/军队生命周期已接通。
2. [Hill静态证据](evidence/fms-hill-recovery-2026-10-04/HILL_STATIC_RECOVERY.md)：只展开GetHeightMap及邻接getter、powf类依赖；9个手工推导/Python float32复核样例，**不是原DLL运行输出**。普通非整数幂逐位和Unity RNG状态仍未知。
3. [单次画笔输入报告](evidence/fms-brush-input-2026-10-04/BRUSH_INPUT_REPORT.md)：原中心来自Raycast Collider的CellIndex，范围来自OverlapSphere，不能把最近点查询冒称原拾取；新增唯一SetCellAsSea叶子核实Elevation/State/Biom置0。UI中高度45、两处半径1.5/3.5只是序列化候选，活动绑定与衰减默认仍未知。
4. [参考基线](FMS_REFERENCE_BASELINE_2026-10-04.md)：补看具名视频0:24/0:42/1:00，实际菜单画面、官方快捷键文字、静态恢复与未知分别记录。约1:01.56登录提示处停止；不无限重试。原完整撤销/缩放视频尚未观察。
5. [V5计划检查](../scripts/check-v5-plan.mjs)接入现有plan:check：依赖/循环/证据/当前阶段及首份真机视觉门均验证；即使V5全done也不能解锁原发布门。新增test:plan进入现有build:cf检查链，未另建CI/部署链；AGENTS中旧PH顺序已纠正。

WEB-PH00完成的范围是**建立具名参照基线与可实现的输入输出合同**，不等于完整原作恢复。不存在必须继续全包逆向才能开始WEB-PH01的输入阻塞；未恢复行为留给具体切片与WEB-PH02对照，不虚填通过。当前转入WEB-PH01，WEB-01-01入口隔离已完成只读审查，UI代码尚未实现。

## 实际检查

- 最终数值测试68/68通过，Vitest 02:11:22开始、482ms；两文件ESLint通过；项目tsc --noEmit通过。之后仅修正一条报告文件名注释，无行为改动。
- V5检查器通过npm run test:plan再次核实11/11（151.2214ms），三个脚本ESLint通过；该命令已加入现有检查链。
- 原发布保护测试22/22通过（6063.0208ms），动态导入未破坏原检查器最小夹具。
- 最终任务/文档、摘要、旧字段与发布门核对见[本批verification](evidence/fms-brush-numeric-2026-10-04/verification.json)。不要拿前置63项结果覆盖后来新增擦海后的68项检查。
- Git默认JSON换行转换会改变证据摘要，已为本批三个证据目录按项目既有方式设置字节保留；冻结原文件不重写，Git暂存内容与工作文件逐一核对。此修复不影响产品代码、数值结果或发布锁。
- 本批无新构建、无浏览器绘图/移动仿真/真机验收、无用户视觉通过、无云端CI或部署。数值模块尚未接入入口，旧站/旧dist保持原状。

## 下一批直接做什么

1. **WEB-01-01独立入口与竖屏触控。** 在src/main.tsx建立按URL选择的惰性入口；不要只在RootApp里加screen，因为它会先生成旧640草稿并打开旧库。V5入口不触碰旧存档；独立命名空间建议lieguoji-fms-web-v1，完整事务/版本/CAS/备份在WEB-01-03落实。
2. 复用src/world/camera.ts。源网格直接读取createTerrainTopology的points/triangles/neighbors，先绕开Atlas四百余万采样转换。该Delaunay网格明确标注为网页适配，不能称原Unity拓扑。显示、拾取和未来保存同源；半径用世界单位，每笔冻结选区/邻接顺序/种子。
3. 按依赖进入WEB-01-02闭合轮廓和海陆笔刷、WEB-01-03撤销/独立保存，再做WEB-PH02保形自然化与连续表现。不能用四模板入口或旧640国家演示代替手绘。只放可用工具；先完成一批功能再统一检查，不反复跑未改范围。
4. 原视频未知可随对应切片补对照，不再先做一轮宏大规划或重复已恢复GetHeightMap。需要用户真机/视觉判断时保留待验，并继续不依赖该验收的绘图优化。

## 安装包和未知边界

仅只读D:/steam/steamapps/common/FantasyMapSimulator；不写安装目录、不读认证/SDK配置/envs.log/个人存档，不运行原EXE/DLL/完整recovered main。源为Windows x64 PE / Unity2021.3.36f1 / IL2CPP v29；不伪称ELF/DWARF或已有可调用hk4e-mcp。raw/dump/解析器只留ignored .autopilot/fms-audit/，不提交、不进入dist。

保留未知：Collider几何/完整投影、活动UI默认范围、原生拓扑、Unity随机状态、普通powf逐位、海洋Shader/LOD、拖动时序/撤销和完整模拟。网页可明确适配并对照；原实体维护不能靠只清高程宣称完成。

旧本地试玩存档atlas-17708eca-a8dc-465b-9763-8f82a1539ca6保留；localhost4173是否运行要实际核实。旧[引擎审查](evidence/fms-web-replan-2026-10-04/EXISTING_ENGINE_AUDIT.md)与[前次规划保留检查](evidence/fms-web-replan-2026-10-04/verification.json)保持历史证据，不当作本批新源码验收。
