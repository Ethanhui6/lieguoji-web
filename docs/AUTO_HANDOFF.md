# 当前续接：Fantasy Map Simulator 网页重建 V5

更新：2026-10-04 香港时间 06:35，有界轮廓平滑检查点。先核实 Git，读取 CODEX_AUTOPILOT_V5.md、plan/tasks.json.webRebuild 和本文件；接续实际代码，不从头重写计划，不重复已有恢复。旧 tasks/phaseState/programme 保留历史，不决定当前开发顺序。

## 当前位置

**WEB-PH02 / WEB-02-01 仍 in_progress。** 本批新增显式轮廓平滑、修复实际三角面保护拾取、裁剪河口中心线。真实网格移动、预览确认、整步撤销和保存恢复已接通；4/16/40 倍观察仍有短直线海岸、折角河道和简单海洋，**尚未达到自然海湾/岬角观感**。不能以 313 测试或折角指标降低宣布本项完成。下一批继续轮廓分辨率与连贯性，不重做旧档保护矩阵或只写计划。

目标 iPhone13ProMax，用户报告 iOS27，Safari/Chrome，竖屏、原作风格、折叠工具。首份真机和用户视觉门未过，不扩建国家、行政、家族、信仰。heartbeat v5 续接；**香港时间 2026-10-04 08:00 截止，到期先保存检查点，不开始新批。** 只报告已执行工作，不声称会话后自行后台开发。

## 本批实际变化与证据

- “预览轮廓平滑”是独立显式操作，最大偏移 0—4 地图单位、默认 0，作用于当前真实 float32 网格。高程/连接/保护位不改；每次操作相对当前图，连续确认会累积，UI 明示。
- 每次对应点位移不超过上限；每个正面积陆地/水域连通组件总面积变化≤2%；位移梯度≤0.2，对应点间距倍率在 [0.8,1.2] 内，合法矩形源网格不折叠。**不是每个三角面面积≤2%，不是任意固定剖面宽度不变，也不是最初轮廓永久锚点。** 本次最大单面面积变化23.87%。
- 任一玩家保护点涉及的整面坐标固定；面积严格小于4096的组件边界固定，非整个岛内部固定。两环采样支撑不足的细部跳过；其余窄颈受间距/拓扑约束。零面积h20接点不能合并两岛面积预算。
- 源网格矩形覆盖、朝向、边抵消、顶点link、Euler与连通先检查；Worker候选由主线程预览及确认重验。海岸折角平方和无改善拒绝应用。旧海岸微细化仍保持每父面海陆各≤2%且旧点/旧边交点固定，未静默放宽旧合同。
- 初版独立移动h20细化点让折角指标623.223→690.941，保留失败截图/几何记录。修复为与原父面仿射联动；最终算法同一原图诊断623.223→552.684。最终浏览器以失败后测试图revision25为输入，690.941→621.207；两者不能混记。
- 保护笔刷改用实际 stored float32 三角面与圆相交，修复非Delaunay网格中落点所在面漏保护；有限空间索引/扫描超预算整笔拒绝。普通海陆笔刷仍沿用已恢复的Voronoi数值选择，不宣称原Unity collider等价。
- 河段中心线在实际h20交点截止，零长出海段跳过；恰好h20终点的上游段也用平端帽。receiver/汇流/保存数据不变。粗线斜交时边缘仍可能盖海，**未实现整条笔画像素裁剪**。
- 整体lint/typecheck、相关16文件313/313测试、测量脚本ESLint通过；24组独立面积/海岸交点/奇异值/非网格线剖面量测通过。未跑全套旧游戏测试，不是云端CI或真机。
- 最终开发浏览器38,042点中11,280点移动，最大点位移1.68722、h20交点1.49949；单组件面积最大变化0.052258%；703个涉及保护面的点坐标完全不变。取消不改checksum；确认26→撤销27→重做28→保存storedRevision13→刷新完整JSON文本一致，590锁保留。
- 生产构建严格CSP下真实Worker预览通过；取消不改档，确认4→撤销5→重做6→保存storedRevision5→刷新完整JSON一致，371锁保留；两端console warn/error为0。4/16/40倍截图来自桌面Chromium原生428×926视口、鼠标/键盘，不是iPhone/Safari/WebKit。
- 数值对象经CDP传输有double末位舍入，原精确检查确实失败；改用浏览器JSON文本传输后精确验证通过，没有放宽容差。完整测试网格只留ignored .autopilot。

本批：[报告](evidence/fms-coast-smoothing-2026-10-04/COAST_SMOOTHING.md)、[24组量测](evidence/fms-coast-smoothing-2026-10-04/measurements.json)、[实际网格](evidence/fms-coast-smoothing-2026-10-04/browser-geometry.json)、[同输入诊断](evidence/fms-coast-smoothing-2026-10-04/same-input-diagnostic.json)、[开发浏览器](evidence/fms-coast-smoothing-2026-10-04/browser-checks.json)、[生产浏览器](evidence/fms-coast-smoothing-2026-10-04/production-browser.json)、[指纹](evidence/fms-coast-smoothing-2026-10-04/verification.json)。

## Git、产物与发布锁

- D:/游戏/架空地图模拟器，codex/ph06-world-generation；批起点cf6532c；源码提交 **fd6f8a5bf174b0de519eaf9e532e32ae74377873**。证据与本文件单独checkpoint提交，当前HEAD以git log -1核实。
- dist绑定fd6f8a5，39允许产物，coast.worker-BRJki1Ok.js；build.json与全部产物SHA256见本批verification.json。0.5.0-preview.33是本地基线，不是完成度。dist未上传。
- 只读核实remote=https://github.com/Ethanhui6/lieguoji-web.git，hooksPath=.githooks。既有Pages lieguoji-web，唯一原生Git链main生产/其他分支预览；历史URL https://lieguoji-web.pages.dev/ 本批未联网核实或更新。
- **禁止push/tag、远程PR/Issue/Milestone、上传和Pages触发。** 9月24例外已消耗；发布锁/pre-push/CSP不改，不另建部署链。V5完成不自动解除旧全部PH门。
- plan仅webRebuild更新；其余顶层字段与cf6532c完全相同。旧61任务/36PH/144子项、CANON/核图正史/长征保留。

## 本地入口与测试数据

- 开发 http://127.0.0.1:5180/?fms=1 （session65287）；产物预览 http://127.0.0.1:5181/?fms=1 （session55887），续接先核实存活。不是公网或手机可访问URL。
- FMS惰性独立入口，不挂RootApp/LegacyEntry，不建旧640草稿。存储命名空间lieguoji-fms-web-v1保持，两个工程测试origin均DB2。
- 5180：v2 revision28/storedRevision13/590锁/38,042点，checksum=531dd4b69588bb59f3823f3ac2ff995516d415c998741fd0d0b1a9b3a12f5484；beforeProtection仍v1 revision10。
- 5181：v2 revision6/storedRevision5/371锁/36,864点，checksum=c5a7325d5ae3b8d0a4e0921e311c8475cd4d5421c21d16d1fca2837ded688684；beforeProtection仍v1 revision2。
- 均人工工程测试图。旧4173 atlas-17708eca-a8dc-465b-9763-8f82a1539ca6未打开/覆盖。开发IAB标签7留handoff，生产临时标签19已关闭；视口/CDP尺寸覆盖均复位。完整网格/原始资料不入Git或dist。

## 继承的保护与限制

- 用户指出的backup恢复归档缺口已在5f56088修复，本批persistence.ts未改。313测试包含DB1 current损坏/缺失×beforeProtection不存在/已有、二次v2保存的四路径回归；有效current??backup归档、不覆盖、CAS/原子升级/阻塞放弃不迟到写入仍通过。没有手动归档恢复按钮。
- 普通自然化fms-shape-preserving-relief-v4固定当前h20线性海岸，含微细化/平滑后的海岸；旧v1已保存的收缩不自动恢复。沿海低地宽度1%—20%、默认3.5%，有1.8平均点距下限，仅内陆过渡。
- 前批微细化源码176f396；证据见evidence/fms-coast-refinement-2026-10-04。本批没有重做该功能。旧微细化的小岛/细颈仅两环支撑+父面面积/位移保障，不可套用本批平滑的4096边界固定合同。
- 水文是网页图上priority-flood/汇流/湖深适配，非原作气候侵蚀。当前每点单位汇流非面积加权降雨；纯坐标平滑保持图/高程所以路由数值不变，显示使用实际新位置。模拟接入前需冻结版本/尺度合同。
- 当前1536单位、36,864基础点不是最终大图。载入/编辑/预览仍有主线程验证和水文计算；桌面样本生成约0.55s、主线程验证约0.39s，手机性能未知。
- 4/16/40倍只是直接地形局部观察，不是WEB-02-02同输入直接源/Atlas完整对照。参数仅会话使用、存档保存实际地形；真机和用户视觉未验收。

## 下一批直接开发

1. 继续WEB-02-01真实轮廓分辨率/连贯性，形成自然海湾与岬角；保留本批面积/位移/间距合同、保护面、撤销存档与失败样例。新网格/算法须对同图核对轮廓、阴影、拾取和保存，不能仅叠按钮、调色或放宽阈值判成功。
2. 01前置完成后才做WEB-02-02同输入/种子/相机直接源地形与Atlas对照，查明源算法/重采样/材质差别并完善海洋、河口、湖边和连续缩放；不强制回旧Atlas。
3. WEB-02-03真实iPhone13ProMax Safari/Chrome触控/性能/视觉交用户验收。继续不依赖人工门的绘图工程，08:00到期保存检查点；当前没有新的登录授权需要，发布冻结。

## 材料范围

只读授权D:/steam/steamapps/common/FantasyMapSimulator；不写安装目录，不读认证/SDK/envs.log/个人存档，不运行完整原作EXE/DLL或恢复脚本。本批未读取新安装材料；raw/dump留ignored .autopilot/fms-audit，不提交、不入dist。
数值与参考见docs/FMS_REFERENCE_BASELINE_2026-10-04.md、docs/evidence/fms-brush-numeric-2026-10-04/verification.json。绘图底座36bd1ac、旧产品基准42af5433保留。不重复恢复GetHeightMap/SetCellAsSea；原Collider/活动UI参数/拓扑/Unity RNG逐位/海洋Shader/LOD/完整模拟仍有未知，按具体切片有界恢复。
