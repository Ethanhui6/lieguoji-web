# 当前续接：Fantasy Map Simulator 网页重建 V5

更新：2026/10/4 07:44:47 香港时间，面积汇流检查点。先核实Git，读CODEX_AUTOPILOT_V5.md、plan/tasks.json.webRebuild、本文件；接续已有代码。旧tasks/phaseState/programme只作历史及发布审计，不决定开发顺序。

## 截止检查点与用户方向纠正（2026-10-04T03:44:36.236Z）

已核实超过香港时间2026-10-04 08:00截止。最后功能源码仍fb8e821，之前证据检查点876f3c3；本次只更新续接记录，没有启动runoff性能优化或新恢复批。当前等待用户解除本次时间截止，发布锁/真机/用户视觉门不变。

用户再次要求按图片的原作恢复流程推进。下次经授权恢复后，优先沿已有类型/地址索引核实World.InverseVoronoiTransformPoint、World.GetCellIndex及其必要边界，补原作绘图坐标/选区链，再接网页可运行切片、同输入数值/画面对照。函数未在本轮恢复，不宣称已完成。现有报告中的0x43A1D9/0x43A29F是调用点，不能误作被调函数RVA；GetHeightMap/SetCellAsSea已恢复的范围不重复。Windows PE/IL2CPP替代截图的ELF/DWARF步骤，暂无hk4e-mcp；原作执行仍不获授权。

## 当前阶段与截止

**WEB-PH02 / WEB-02-01仍in_progress。** 可画闭合轮廓、海陆笔刷、保形自然化、海岸细化/平滑、连续缩放、撤销保存恢复。海岸粗拐角、折角河道和简单海洋仍未达到用户要求；不能以点数/345测试判完成。

目标iPhone13ProMax，用户报告iOS27，Safari/Chrome，竖屏、原作风格、折叠工具。首份真机/用户视觉门未过，不扩建国家、行政、家族、信仰。**香港时间2026-10-04 08:00截止，到期先保存检查点，不开始新批。** 不声称会话结束后仍后台开发。

## 本批：实际陆地面积汇流

- 源码 **fb8e82196d51c12587fcf30bf020b5c46610043f**，批起点8e8aa59；本文件/证据另作本地checkpoint，当前HEAD用git log -1核实。
- 原每陆地点1单位改为land-area-runoff-v2：按实际float32三角面裁剪h>=20的陆地面积，均分给该面陆地角点；海点本地源量0，孤立h20零面积不造水。Float64本地源量/累计量，单位平方世界单位；不是原作算法或真实降水体积。
- 默认河流阈值max(512,landArea*0.003)，不随采样点数重新归一化；线宽仍为累计量/阈值的无量纲比例。
- Worker传输/主线程校验同步。请求自有几何快照核对源量、每节点流入+源量=累计值、总出口、无环、湖深、河段完整性；有海组件禁止陆地终端，无海组件唯一稳定最低点终端。伪造全部receiver=-1且守恒的响应也拒绝。不是完整逐位重算priority-flood。
- 接收者选择算法未改；新增邻接和局部分配仍改变河道/河口，**源量守恒不等于河网重采样不变**。文档schema/持久化代码未改，水文不存盘；旧FMS文档加载会重新派生水系，外观可能变化。
- 18文件345/345相关测试、整体lint/typecheck、measure脚本lint通过。首次两处lint失败（多行调用/缺Buffer导入）已修复并保留输出；未放宽检查。不是全套旧游戏测试或云端CI。
- 12组独立裁剪面积/加密守恒对照通过，纯细分源量相对差最大6.10352e-7，对应float32面积误差；旧点计数源量可放大2.169—41倍。实际图38042→40789点时陆地点11163→13910（+24.608%），新版源量627430.765→627595.896（+0.0263186%，与真实面积相符）；逐点最大守恒误差3.64e-12。实际图河段987→1048，仍有路径依赖。Node单次水文约249/269ms，不是手机结果。
- 开发入口：实际Worker预览/取消checksum不变/再次生成确认/撤销/保存/刷新。生产入口：严格CSP下实际Worker预览/确认/撤销/保存/刷新。两入口完整JSON刷新一致、操作后除revision外恢复原地图；玩家锁与启用前v1归档保持。两入口warn/error为0。
- 均428×926桌面Chromium鼠标/键盘，不是iPhone/WebKit/真实触控。一处浏览器测试按钮名称写错匹配0元素，按当前名称修正后完成，非产品保存故障。

本批：[报告](evidence/fms-area-runoff-2026-10-04/AREA_RUNOFF.md)、[独立量测](evidence/fms-area-runoff-2026-10-04/measurements.json)、[开发浏览器](evidence/fms-area-runoff-2026-10-04/browser-checks.json)、[生产浏览器](evidence/fms-area-runoff-2026-10-04/production-browser.json)、[源码/产物指纹](evidence/fms-area-runoff-2026-10-04/verification.json)。

## Git、构建和发布锁

- 目录D:/游戏/架空地图模拟器，分支codex/ph06-world-generation。dist绑定fb8e821，39允许游戏产物；完整SHA见本批verification。preview.33是切片版本基线，不是完成度。
- remote沿用https://github.com/Ethanhui6/lieguoji-web.git，hooksPath=.githooks。Pages lieguoji-web唯一原生Git链，main生产、其他分支预览；历史https://lieguoji-web.pages.dev/本批未联网核实或更新。
- **禁止push/tag、远程PR/Issue/Milestone、上传、Pages触发。** pre-push/CSP/发布策略未改，9月24单次例外已消耗；不另建部署链。V5完成不自动解除旧全PH门。
- plan只更新webRebuild；其余顶层字段、firstPlayableGate与8e8aa59逐字段核对保持。旧61任务/36PH/144子项、CANON/正史/长征保留。

## 本地入口与测试存档

- 开发 http://127.0.0.1:5180/?fms=1 （原session65287），生产预览 http://127.0.0.1:5181/?fms=1 （原session55887）。续接先核实服务存活；不是公网/手机URL。
- FMS惰性独立入口，不挂RootApp/LegacyEntry，不建旧640草稿。两个工程测试origin均lieguoji-fms-web-v1/DB2。
- 5180最终：v2 revision35/storedRevision16/590锁/40789点，checksum=71d891242b4adbb40a376c89a26eabac4bbdccc5182d903083299e422ceca7f5；beforeProtection仍v1 revision10。河段图1048/绘制989、河口78、湖点54。
- 5181最终：v2 revision11/storedRevision7/371锁/37550点，checksum=57257921dd0de327cc19de5266a8cc7cc5b5d8dd646ec31da7bdc109ce251714；beforeProtection仍v1 revision2。河段图173/绘制141、河口68、湖点0。
- 都是人工工程测试图；旧4173 atlas-17708eca-a8dc-465b-9763-8f82a1539ca6未打开/覆盖。开发IAB标签7留handoff；本批生产临时标签21关闭、视口复位。
- ignored .autopilot/resolution-before.json与resolution-after.json为上一批rev28/31人工测试网格；本批最终开发rev35与rev31地图内容相同，仅revision不同。完整网格不提交/dist。

## 已有合同与当前限制

- 海岸共享h20交点/局部细分和平滑源码f4d5f76证据在fms-coast-resolution目录；最终float32候选相对原渲染面未量化前像验位移≤每次0—4、每正面积组件总面积变化≤2%、梯度≤0.2/对应点距倍率[.8,1.2]。不是每面2%，不是固定剖面宽度不变；反复确认仍累积，最初轮廓永久锚点未做。
- 原固定面/小组件（边界面积<4096）在细分前确定并继承，面边不拆分；50k点上限/最多3轮/2单位目标长度保留，目标长度不保证。原点高程/锁不变，新h20点锁0；显示/拾取/保存同一真实网格。普通画笔选区仍是Voronoi适配，非原Collider等价。
- 阴影从网格确定重建；纯细分原非h20点shade保持，不保证新增点/原h20边或全图像素不变。新水文不改变海岸几何。河流中心线h20裁剪与butt端帽已有；整条线宽陆地mask未实现。
- 普通自然化fms-shape-preserving-relief-v4固定当前h20海岸；沿海低地1%—20%、默认3.5%，1.8平均点距下限，仅内陆过渡。旧v1已保存收缩不自动恢复。
- backup恢复归档缺口5f56088已修；chosen有效current??backup、归档不覆盖、CAS/原子升级/失败不迟到写入保持，345测试包含恢复矩阵。尚无手动归档恢复按钮，不重复恢复同缺口。
- 1536单位/36864基础点不是最终大图；50k上限未抬高。主线程完整几何/源量重验/水文仍有成本，手机内存耗时未知。海洋材质、连续大图LOD、完整模拟未知；正式CANON独立待验。

## 下一批

1. 继续WEB-02-01自然海湾/岬角和粗层级轮廓；面积源量已修，后续针对邻接/局部分配的流路尺度敏感性与主线程成本，不重复把单位点源量问题当未修。
2. 01前置完成后才开展WEB-02-02同输入/种子/相机直接地形与Atlas完整对照、海洋/湖边/河口连续过程。WEB-02-03真机/用户视觉不可代验；不扩建国家等系统。
3. **08:00到期仅保存检查点，不开始新批。** 当前无新登录/秘密输入需求，云端冻结。

本批未读取新安装材料。安装目录D:/steam/steamapps/common/FantasyMapSimulator只读，不读认证/SDK/envs.log/个人存档、不运行原EXE/DLL/恢复脚本。raw/dump只在ignored .autopilot/fms-audit，不提交/dist。原参照见FMS_REFERENCE_BASELINE与fms-brush-numeric证据；不重复恢复GetHeightMap/SetCellAsSea。
