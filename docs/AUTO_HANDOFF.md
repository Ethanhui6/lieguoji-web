# 当前续接：Fantasy Map Simulator 网页移植 V5

更新：2026-10-05，原包降水河网和河流增湿已接入气候地貌；可见河段与分类使用同一组最终河流。先读 CODEX_AUTOPILOT_V5.md、plan/tasks.json.webRebuild 并核实 Git；本文件优先于旧批次记录。

## 当前检查点

- 功能源码 **a200a00a9b75a05bd707374bb5fc5c76b76802c5**（原降水河网/增湿/同源渲染）；之后为文档证据checkpoint，续接查Git。本批开始于175a8a2，气候入口235224d + 失败降级ef4aad5、高度3420537、海洋c6008b0、点击模板2d4d589、原生Hill fd9f366保留。
- **WEB-PH02 / WEB-02-01 仍 in_progress**；nextBatch仅WEB-02-01。iPhone13ProMax（用户报告iOS27）Safari/Chrome真机与用户视觉门未过，不扩建国家、行政、家族、信仰。
- 原海陆笔刷、闭合轮廓、原Hill、pangea/highIsland点击模板、海岸保护、玩家锁、候选对照/取消/确认、撤销与存档保留。

## 本批可玩变化与限制

- “气候地貌（试算）”本批接入原活动FIFO填洼、降水flux、强支流接管、短路径淘汰和最终riverIds。地貌分类的河流增湿及可见河段使用同一份最终河流，不把旧面积源量当原flux。高度/阴影视图仍显示原有汇水面积水系。
- 降水最长边192规则格采当前Float32三角面；最终顶点温度按自身真实高度/纬度计算，修复小岛雪峰落在采样间隙却误用海温的问题。气候格不替换显示几何，不移动h20海岸。
- **原河流增湿已接入**：仅有最终riverId的自身点加max(flux/10,2)，再与陆地邻点原降水平均。湿地分支在原JS关闭，未伪造启用。使用原初始场景north/south=.9/-.9、PrecInput80、温度offset0，seed1337明确为网页选择，不称原运行世界或存档值。
- 保留原Uint16 flux逐次截断/回绕与Uint8临时合流；当前真实图与规则降水格的映射、haven缺失哨兵-1、沿海距离127封顶、真实网格边界是明确网页适配。未侵蚀或写高程。每点降水流量受加密密度影响，不声称面积守恒/物理流量或分辨率不变。
- 河流沿接受路径的实际邻接段绘制，真实h20河口裁剪；原meander/宽度网格尚未移植，使用网页有上限线宽。当前截图细支流偏密，仍须后续视觉处理，不能把算法恢复称作原作观感完成。
- 地貌混色为原色+网页linear邻接混合和连续三角插值。原4096RT/81tap模糊尚未接入，未称原作最终画面等价。小于气候格的细部降水响应仍有精度限制。
- 显示选择不写文档或存档；默认高度配色，刷新恢复默认。单纯模式切换不重建海岸；最多缓存3份派生气候快照。
- 气候预算失败时，单独切换保留旧显示；撤销/重做/取消/候选展示统一切回高度、重绘真正目标文档并同步选项和提示，避免画面与历史分离。其他渲染错误不吞掉。失败路径有5项单元回归，未做浏览器故障注入。

## 真实检查与浏览器证据

- 最终 **28文件459/459相关测试、全src/tests/scripts lint、typecheck、生产build通过**。dist39个允许产物，build.json绑定a200a00；计划11、发布锁22通过。相对175a8a2原计划非webRebuild字段和首份体验门逐字段相等。未声称全旧工程测试或云端CI全通过。
- 独立只读复核提供有效3×3手算合流夹具：56与113合流为169，强支流接管；短支流[1,4]淘汰，保留[3,4,7]。有flux但无最终riverId的点不得获得河流增湿。原文本/恢复脚本未执行。
- 开发40789点/80812三角面：初次气候+河网计算约302.1ms（此桌面一次采样，非手机性能），518条接受河流、2595河流陆地点、2363条可见线段，406点分类受增湿改变。maxFlux1483、未达海组件0、溢出0。陆地温度-17..26。自然化候选重算、原图对照/模式切换/取消正常；取消恢复原网络，重复切换复用缓存。
- 开发显示/候选取消/刷新前后，完整已存current及beforeProtection序列化相等；revision49、590保护点保留。本批persistence未修改，没有为显示功能写存档。当前开发/最终生产均为a200a00源码。
- 最终生产严格CSP下海岸Worker真实加密 **37550→37705→取消37550**；biome/relief切换、不同网格对照、取消恢复原分类，刷新回height。完整current及beforeProtection与本批前相等；控制台warning/error为空。
- 桌面Chromium1280×720；开发竖屏428×926，无横向溢出，候选卡下拉44px高、取消/对照/确认按钮可见。**尺寸仿真不等于iPhone、Safari/WebKit或实际触控验收。**
- 本批开始两端口已不存活；在项目内用官方Node/Vite隐藏进程恢复，无清存档、改安全头或跳检查。最终HTTP200，严格CSP保留；开发与生产warning/error均为空。
- [本批恢复合同](evidence/fms-river-climate-v5-2026-10-05/ORIGINAL_RIVER_FLUX.md)、[统一检查](evidence/fms-river-climate-v5-2026-10-05/checks.json)、[开发](evidence/fms-river-climate-v5-2026-10-05/dev-browser.json)、[最终生产](evidence/fms-river-climate-v5-2026-10-05/production-browser.json)、[指纹](evidence/fms-river-climate-v5-2026-10-05/verification.json)。同目录有高度/降水河网对照、竖屏候选、最终可玩页面和生产网格预览截图。上批气候/材质来源见fms-biomes-v5-2026-10-05/ORIGINAL_BIOMES.md，旧证据保留。

## 原包恢复事实，续接不重复拆解

- 授权main.mjs的温度2584–2632、降水2635–2795、Biomes3638–3752及World参数桥接已独立恢复；5×26矩阵逐项一致。完整源/dump只在ignored .autopilot，不入dist。第三方Azgaar MIT/Alea notice保留并扩充选定气候规则范围。
- 本批又闭合reMarkFeatures2798、Rivers.generate2872、flowDown3001、defineRivers3037、alterHeights3115、实际fillDepression3190、calculateMoisture3727。resolveDepressions/Lakes气候调用在原活动路径中已注释，未误接。恢复合同记录源哈希、差异和数值夹具；无需重新拆包。
- World.Awake Resources.Load Materials/LandMaterial → ResourceManager13 → resources Material10 → Shader322 Unlit/LandShader；RenderBiomByProvince写入_MainTex=World.biomTexture。材质保存noise-rgb但编译shader不读取，未提取或导入无用图片。
- biomTexture → sharedassets0 RT204 Biom4096² → Camera10198 HeightBiomCamera(layer9) → GaussianBlur组件37454/Shader183。Start停用GO；CaptureImage调用Camera.Render；OnRenderImage单次81tap blit、alpha强制1。尚未完整追所有捕获触发事件，不称实时每帧或高度alpha仍保留。
- 场景气候初值与CalculateMapCoordinates0x6A3AB0已对齐核实；LatitudeOutput50是位移百分数，非50°。JS defineMapSize66/27不是当前FromWorld活动路径。
- Windows PE / Unity2021.3.36f1 / IL2CPP29。沿用户图片的索引→小函数/材质→网页切片→检查流程，未假称DWARF/ELF/hk4e-mcp；未运行完整原作、DLL或恢复脚本，未做原进程联调。

## 下一批实际绘图工作

1. 优先将冷气候/降水河网计算移出主线程（当前桌面一次302ms），保证候选、对照、取消、撤销、重做及失败降级始终展示实际目标；不得迟到覆盖新的地图/显示。不要重做已恢复的flux/温度/调色/材质索引。
2. 补原生最终Biom捕获触发、SDF Camera10195海陆alpha输入；原4096模糊与网页连续混色差异要量化后选实现，不因有贴图就整包导入。
3. 海湾/岬角自然感、粗层级折角、最初主体轮廓永久锚点、原KD nearest tie/float桥接和手机主线程耗时仍未完成。继续不依赖人工门的绘图工程，用户确认方向后才扩系统。

## 本地入口与发布边界

- 分支codex/ph06-world-generation；既有remote https://github.com/Ethanhui6/lieguoji-web.git；hooksPath=.githooks。唯一Pages原生Git链lieguoji-web，main生产/其他分支预览。
- **禁止push/tag、远程PR/Issue/Milestone、上传及Pages触发。** 本地通过不等于云端CI或发布解锁。旧站未改，未另建部署链。
- 开发 http://127.0.0.1:5180/?fms=1 PID9420/tab29（停在气候地貌）；生产 http://127.0.0.1:5181/?fms=1 PID11808/tab30。隐藏Node/Vite进程，仅绑定127.0.0.1；不是手机或公网入口，不保证后续存活，续接先核实。两个旧exec session已失效，不复用。
- 两origin独立lieguoji-fms-web-v1/DB2；未读写旧4173草稿。persistence没改，CAS、原子升级、backup v1归档、未来版锁写和多标签保护保留。完整存档不入Git/dist。
- 旧08:00之后用户直接继续请求已恢复本地授权；未创建/延长自动化，不声称会话结束后继续开发。
- 只读指定FantasyMapSimulator安装目录，不读认证/SDK/envs.log/个人存档；正式CANON/五国验收和历史范围保留。历史高度/海洋批次见Git8f81f5b版交接及各evidence目录。
