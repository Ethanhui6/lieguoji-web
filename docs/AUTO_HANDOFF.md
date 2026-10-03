# 当前续接：Fantasy Map Simulator 网页重建 V5

更新：2026/10/4 07:16:50 香港时间，显式海岸边与局部加密检查点。先核实 Git，读取 CODEX_AUTOPILOT_V5.md、plan/tasks.json.webRebuild、本文件。接续现有代码；旧 tasks/phaseState/programme 只保留历史和发布审计要求，不决定当前开发顺序。

## 当前位置与边界

**WEB-PH02 / WEB-02-01 仍 in_progress。** 当前“预览轮廓平滑”已包含真实海岸交点/共享边细分，实际地图可继续画、撤销、保存、刷新；但4/16/40倍观察仍有粗拐角和折角河道，未达到自然海湾/岬角观感。不能以40,789点或327测试宣布完成。

目标iPhone13ProMax，用户报告iOS27，Safari/Chrome，竖屏、原作风格、折叠工具。首份真机/用户视觉门未过，不扩建国家、行政、家族、信仰。**香港时间2026-10-04 08:00截止，到期先保存检查点，不开始新批。** 不声称调度尚未执行的工作完成或会话结束后仍在后台开发。

## 本批实际变化

- “预览轮廓平滑”自动沿h20跨海陆边插入共享点，并最多三轮细分真实海岸边，再共同平滑；没有新面板或假曲线。新增点高程只取20，保留Int32；原点高程、保护位不变，新点锁值0。显示/编辑/保存使用同一存储网格。
- 先用旧网格确定保护面、小组件边界和支撑不足区域，其面边不拆分；原固定点继承，避免拆成纯海/陆面后解锁细颈。共享边两侧同步拆，50k预算截断仍闭合；49,729→50,000回归通过。
- **最终float32候选直接相对原渲染面未量化细分前像量测**，不以量化后的中间图重设起点。每次0—4位移、每正面积组件面积变化≤2%、梯度≤0.2／对应点间距倍率[0.8,1.2]，包含重网格误差。不是每三角面2%，不是固定剖面宽度不变，连续确认仍可累积。
- 旧粗层平滑场仿射传到子点，再混合较小连续空间场并统一缩放；初版逐点缩小产生细碎折角，规则样例被拒绝，现已修复。无改善不应用；moves为空的候选addedPoints不算实际新增。
- 新h20边阴影从存储网格确定重建，纯细分的原非h20顶点shade保持；新增点/原h20边阴影可变化，不承诺全场逐像素不变。水系随新邻接重算，开发图图河段841→696、实际绘制841→650；**单位点汇流导致分辨率敏感，尚需处理**。
- 整体lint/typecheck、17文件327/327相关测试、测量脚本ESLint通过。首次3个独立几何测试超时，已预计算原面包围盒加速查找，未放宽超时/删检查；失败输出保留。不是全套旧游戏测试或云端CI。
- 24组独立裁剪/组件面积/奇异值/剖面/原面高程量测通过，16组实际移动，8组小岛不变。实际图38,042→40,789点，2,747新增、13,975点移动；最大点位移1.193614、海岸交点1.123073、单组件面积变化0.0305055%；703个原保护面顶点变化0。
- 折角诊断621.207→588.798只是诊断，不是自然感评分；4/16/40倍同相机截图仍见粗层级折角。本项未完成，不把局部截图当作WEB-02-02直接源/Atlas完整对照。
- 开发浏览器：取消checksum不变；确认29→撤销30→重做31→保存store14→刷新完整JSON一致。再画陆地32→撤销33→保存store15，除revision外数据恢复一致，再刷新通过。源码重算与实际revision31文档全部字段精确一致，另存阴影hash。
- 生产构建：严格CSP实际Worker生成686点，取消不改档，确认7→撤销8→重做9→保存store6→刷新完整JSON一致；两入口warn/error为0。均428×926桌面Chromium鼠标/键盘，不是iPhone或WebKit。一次3秒CDP等待超时后实查预览已完成，不冒充手机性能通过。

本批：[完整报告](evidence/fms-coast-resolution-2026-10-04/COAST_RESOLUTION.md)、[24组量测](evidence/fms-coast-resolution-2026-10-04/measurements.json)、[实际几何](evidence/fms-coast-resolution-2026-10-04/browser-geometry.json)、[精确重放](evidence/fms-coast-resolution-2026-10-04/exact-browser-geometry.json)、[开发浏览器](evidence/fms-coast-resolution-2026-10-04/browser-checks.json)、[生产](evidence/fms-coast-resolution-2026-10-04/production-browser.json)、[指纹](evidence/fms-coast-resolution-2026-10-04/verification.json)。

## Git、产物和发布锁

- 目录D:/游戏/架空地图模拟器，分支codex/ph06-world-generation。批起点96eae82；源码 **f4d5f76305f87f6d4574205dcec9d03d060e70b8**，证据/本文件单独checkpoint提交，当前HEAD用git log -1核实。
- dist绑定f4d5f76，39允许游戏产物，coast.worker-2MXmECyk.js；build.json及全部文件SHA256见本批verification.json。0.5.0-preview.33是本地切片基线，不是完成度。
- remote沿用https://github.com/Ethanhui6/lieguoji-web.git，hooksPath=.githooks；Pages lieguoji-web 唯一原生Git链，main生产、其他分支预览。历史https://lieguoji-web.pages.dev/本批未联网核实或更新。
- **禁止push/tag、远程PR/Issue/Milestone、上传、Pages触发。** pre-push/CSP/发布策略未改；9月24一次例外已消耗，不另建部署链。V5完成不自动解除旧全部PH门。
- plan只更新webRebuild，其余顶层字段与96eae82完全相同；旧61任务/36PH/144子项、CANON/正史/长征保留。

## 本地入口与测试数据

- 开发 http://127.0.0.1:5180/?fms=1 （session65287），生产产物预览 http://127.0.0.1:5181/?fms=1 （session55887）。续接先核实服务存活；不是公网/手机可访问URL。
- FMS独立惰性入口，不挂RootApp/LegacyEntry，不建旧640草稿。存储命名空间lieguoji-fms-web-v1，两个工程测试origin均DB2。
- 5180：v2 revision33/storedRevision15/590锁/40,789点，checksum=f273e2fca413fb61b127a664dd6d95df9a09c225171daa75bd8d4d7bbc5abc20；beforeProtection仍v1 revision10。
- 5181：v2 revision9/storedRevision6/371锁/37,550点，checksum=e9b8b1daaf26ec271f5ba8d228d0db7d03baa3ccc30e99b338a1ec01892562ab；beforeProtection仍v1 revision2。
- 均人工测试图；旧4173 atlas-17708eca-a8dc-465b-9763-8f82a1539ca6未打开/覆盖。开发IAB标签7留handoff，生产临时标签20已关闭，临时视口复位。完整测试网格仅ignored .autopilot/resolution-before.json与resolution-after.json（后者rev31，最终rev33仅操作版本号不同），不入Git/dist。

## 继承保护与未通过事项

- backup恢复归档缺口在5f56088已修复，本批persistence.ts未改。327测试含current损坏/缺失×归档不存在/已有及二次v2保存；chosen有效current??backup归档、不覆盖、CAS/原子升级/失败不迟到保护保持。没有手动归档恢复按钮，不再重复恢复此缺口。
- 普通自然化fms-shape-preserving-relief-v4固定当前h20海岸（包括加密后），旧v1已保存收缩不自动恢复。沿海低地1%—20%、默认3.5%，有1.8平均点距下限，仅内陆过渡。
- 旧微细化176f396的每父面海陆各2%合同保持；上一批位置平滑fd6f8a5证据保留。本次算法bounded-coast-relaxation-v2仍按每次当前图约束，无最初轮廓永久锚点。旧微细化不能套用平滑的小组件固定合同。
- 当前1536单位、36,864基础点不是最终大图；50k点上限、历史预算未抬高。主线程仍完整重验网格和派生水文，桌面结果不是手机耗时/内存证据。原作海洋材质、连续大图LOD、Collider和完整模拟仍有未知。
- 新增点改变排水邻接和单位点汇流，水系不具备重采样不变性；模拟接入前需冻结水文版本/尺度合同，不能将测试图转正式设定。

## 下一批

1. 继续WEB-02-01粗层级轮廓自然感、局部细节连贯性；同时针对当前真实加密图定位水系的分辨率敏感性和主线程成本。保留本批原图几何预算，不凭点数、mask或折角指标判视觉通过，不再只叠按钮。
2. 01前置完成后才做WEB-02-02同输入/种子/相机直接源地形与Atlas完整对照及海洋/湖边/河口连续过程。WEB-02-03真机和用户视觉交用户验收；不扩建国家等系统。
3. 08:00到期先保存检查点，不开始新批。当前无新登录授权或秘密输入需要，云端冻结。

## 材料范围

本批未读取新安装材料。只读授权D:/steam/steamapps/common/FantasyMapSimulator，不写安装目录，不读认证/SDK/envs.log/个人存档，不运行原EXE/DLL/恢复脚本。raw/dump留ignored .autopilot/fms-audit，不提交、不进dist。
原作参考见docs/FMS_REFERENCE_BASELINE_2026-10-04.md和fms-brush-numeric证据；36bd1ac绘图底座、42af5433旧产品基准保留。不重复恢复GetHeightMap/SetCellAsSea；按有界切片接续未知项。
