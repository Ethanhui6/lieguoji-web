# 当前续接：Fantasy Map Simulator 网页移植 V5

更新：2026-10-04，原作高度编辑配色已接入真实绘图与候选预览。先读 CODEX_AUTOPILOT_V5.md、plan/tasks.json.webRebuild 并核实 Git；本文件优先于旧批次记录。

## 当前检查点与实际进展

- 功能源码 **3420537a6fab122bd7fb290a72ed8a37f4191c15**；之后有文档/证据 checkpoint，续接查 Git。此前海洋c6008b0、点击模板2d4d589、原生Hill fd9f366保留。
- **WEB-PH02 / WEB-02-01 仍 in_progress**；nextBatch仅WEB-02-01。首份iPhone13ProMax（用户报告iOS27）Safari/Chrome真机与用户视觉门未过，不扩建国家、行政、家族、信仰。
- 原海陆笔刷、闭合轮廓、原Hill、pangea/highIsland点击模板、海岸保护、玩家锁、预览对照/取消/确认、撤销保存均保留。
- 新默认“原作高度配色”来自实际Shader189 mode2，使用20/60/100色阶与编译binary32常数，非猜色；折叠设置和候选卡均可切换“起伏与阴影”。后者保留网页旧配色/阴影，不称原作biome。显示选择仅会话内，刷新恢复默认高度模式。
- 切换只改uniform，不写地图/存档，不改海岸，不重建水文/海岸纹理。几何换网格时也保留选定模式。
- 海洋沿既有真实Float32 h20海岸距离场；本批补上官方Linear材质Color上传及标准sRGB输出适配（解码→linear混合→编码），原场景色端点不二次抬亮。原最终Camera/RT/后处理链仍未完整核对。
- **24文件429/429相关测试、整体lint/typecheck、生产build通过**，39允许游戏产物，build.json绑定3420537。计划11、发布锁22通过。首轮计划检查引用了尚未落盘的本批证据文件，已完成落盘后重验；初次失败日志保留。本批没有代码检查失败；只读复核发现预览期下拉不可达，已补候选卡入口后统一检查。

## 浏览器实际证据

- 开发40789点、80812三角面。渲染替换前后完整已存地图逐字节相同；高度/阴影切换不增加oceanBuilds；预览中切换、原图对照、取消均正常。
- 真实自然化Worker候选：lakeCells237→158、可见riverSegments884→612，海岸5241段与陆地面积保持。确认→撤销→重做→再撤销后，实际地图除revision外完全等于最初；保存刷新完整相等，beforeProtection归档不变。当前revision49/storedRevision24，checksum611549531f9be59fcd0f3b1b4beb26d07be265ce78c4155a9981aa7330c2a7b0。
- 生产严格CSP下真实海岸Worker加密37550→37728点；原图/候选/显示切换/取消来回替换无资源错误，模式保留。取消与刷新后完整生产origin存档等于本批前；默认height恢复。
- 桌面Chromium实际1280×720；开发竖屏428×926，下拉44px高、候选卡切换与底部按钮可见，实际2倍缩放检查。两origin本批控制台warning/error为空。
- **没有冒充真机、Safari/WebKit、实际触控或原作视觉等价。** 数值/桌面通过不是WEB-PH02完成。
- [本批原作证据与适配合同](evidence/fms-land-material-v5-2026-10-04/ORIGINAL_LAND.md)、[统一检查](evidence/fms-land-material-v5-2026-10-04/checks.json)、[开发浏览器](evidence/fms-land-material-v5-2026-10-04/dev-browser.json)、[生产浏览器](evidence/fms-land-material-v5-2026-10-04/production-browser.json)、[源码产物指纹](evidence/fms-land-material-v5-2026-10-04/verification.json)。同地图同相机before/after、portrait-preview等截图在同目录。

## 本批恢复事实，避免重复拆解

- level0 World44231 raw@0x3C0 PPtr(2,11) → sharedassets0 Material11 VertexUnlitColor → Shader189 Custom/HeightColorDisplay。材质_Color20/_Color50/_Color100是未消费的遗留项，实际分段为h60。
- GetDrawProvinceMeshVertices0x6B55B0读取int Elevation，除100写List<Color>.a；每cell全部顶点同高度。GenerateDrawProvinceMesh0x6AE170跳过h<20。UV不编码高度。
- EditPanelUI.GetCurrentDrawProvinceMode0x8DE1F0在高度编辑面板启用时返回2；SetDrawProvinceMode0x6C2760逐drawProvince sharedMaterial写_DisplayMode。GetOrCreateDrawProvinceMaterial0x6B6C30复制provinceBiomHeightMaterial，区别于defaultLandMaterial的另一个biome路径。
- Shader189无纹理/噪声；mode2色阶经过着色器内三次sRGB→linear近似。网页按标准显示输出再编码sRGB，未叠加网页山体shade，但河湖/海岸描边/保护层仍是适配。
- **几何差异明确**：原每cell面同高度，网页共享三角顶点连续插值，保持既有可见h20海岸合同；不称逐像素或逐bit等价。独立binary32参考fixture不是原GPU读回。
- mode0的RGB依赖真实biome与邻接混色；网页文档无biome/气候字段，未凭高度伪造。原最终颜色/默认底图/相机alpha还有缺口。
- 源为Windows PE / Unity2021.3.36f1 / IL2CPP29，按小函数/材质并行只读恢复、root独占接入；未假称DWARF/ELF/hk4e-mcp，未运行原作/恢复函数，未做原进程联调。第三方Shader署名未知；raw/dump不入Git/dist。

## 下一批实际绘图工作

1. 有界核对defaultLandMaterial实际Shader、biome/气候颜色输入，确认可独立移植的地貌显示。**已恢复的Shader189/高度alpha/menu mode和Shader191/SDF kernels不重做。** 不为缺少数据随意填颜色。
2. 继续SDF Camera10195真实海陆alpha绘制/刷新调用，核对最终颜色输出链；接到可玩切片后再统一检查。
3. 海湾/岬角自然感、粗层级折角、永久原始轮廓锚点、原KD nearest tie/float桥接和手机主线程耗时仍未完成。先用户确认绘图方向，再扩建后续系统。

## 本地入口与发布边界

- 分支codex/ph06-world-generation，既有remote https://github.com/Ethanhui6/lieguoji-web.git，hooksPath=.githooks。唯一原生Pages Git链lieguoji-web，main生产/其他分支预览。
- **禁止任何push/tag、远程PR/Issue/Milestone、上传、Pages触发。** 本地通过不等于云端CI或发布解锁。旧站未改，未另建部署链。
- 开发 http://127.0.0.1:5180/?fms=1 session32686/tab26；生产 http://127.0.0.1:5181/?fms=1 session93528/tab27。仅本机地址，不是手机或公网入口，续接先核存活。
- 两origin独立lieguoji-fms-web-v1/DB2；本批未读写旧4173草稿。存储代码没改，CAS、原子升级、backup v1归档、未来版锁写、多标签保护保留。完整存档不入Git/dist。
- 08:00后的用户直接继续请求已恢复本地授权；本批未延长自动化，不声称会话结束后自动开发。
- 只读授权的FantasyMapSimulator安装目录，不读认证/SDK/envs.log/个人存档；正式CANON/五国验收和全部历史范围保留。
- 历史海洋恢复/420测试等见Git f810e1e版AUTO_HANDOFF及 [ORIGINAL_OCEAN](evidence/fms-ocean-v5-2026-10-04/ORIGINAL_OCEAN.md)，不按旧国家行政顺序继续。
