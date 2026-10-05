# 当前续接：Fantasy Map Simulator 网页移植 V5

更新：2026-10-05，已将恢复的气候/降水河网移入可取消Worker，计算期间显示当前高度地图，保持导航和历史正确。先读 CODEX_AUTOPILOT_V5.md、plan/tasks.json.webRebuild 并核实 Git；本文件优先于旧批次记录。

## 当前检查点

- 功能源码 **20792cb8b3f024f817b678137b0eb5b36df5f08e**（气候/河网Worker与异步显示）；之后为文档证据checkpoint，续接查Git。本批开始于f5b8371。原数值a200a00、气候入口235224d + 降级ef4aad5、高度3420537、海洋c6008b0、点击模板2d4d589、原生Hill fd9f366保留。
- **WEB-PH02 / WEB-02-01 仍 in_progress**；nextBatch仅WEB-02-01。iPhone13ProMax（用户报告iOS27）Safari/Chrome真机与用户视觉门未过，不扩建国家、行政、家族、信仰。
- 原海陆笔刷、闭合轮廓、原Hill、pangea/highIsland点击模板、海岸保护、玩家锁、候选对照/取消/确认、撤销与存档保留。

## 本批可玩变化与限制

- 本批将“气候地貌（试算）”采样、分类、FIFO河网和增湿整体迁入module Worker；原数值没有改。新文档立即显示自身高度/面积水系，完成后颜色与气候河流一起切换；提示等待但不阻塞导航。
- 取消、显示切换、候选对照和历史选择拥有当前请求；旧线程终止，已排队迟到成功/失败也不能覆盖新目标。输入克隆但不转移历史数组，只转移派生输出8个TypedArray缓冲。最多保留3份地形缓存，上下文丢失/销毁时清理。
- 原活动FIFO填洼、降水flux、强支流接管、短路径淘汰和最终riverIds来自上批。地貌增湿与可见河段仍同源，高度/阴影仍是原面积水系，不混用单位。
- 降水最长边192规则格采当前Float32三角面；最终顶点温度按自身真实高度/纬度计算，修复小岛雪峰落在采样间隙却误用海温的问题。气候格不替换显示几何，不移动h20海岸。
- **原河流增湿已接入**：仅有最终riverId的自身点加max(flux/10,2)，再与陆地邻点原降水平均。湿地分支在原JS关闭，未伪造启用。使用原初始场景north/south=.9/-.9、PrecInput80、温度offset0，seed1337明确为网页选择，不称原运行世界或存档值。
- 保留原Uint16 flux逐次截断/回绕与Uint8临时合流；当前真实图与规则降水格的映射、haven缺失哨兵-1、沿海距离127封顶、真实网格边界是明确网页适配。未侵蚀或写高程。每点降水流量受加密密度影响，不声称面积守恒/物理流量或分辨率不变。
- 河流沿接受路径的实际邻接段绘制，真实h20河口裁剪；原meander/宽度网格尚未移植，使用网页有上限线宽。当前截图细支流偏密，仍须后续视觉处理，不能把算法恢复称作原作观感完成。
- 地貌混色为原色+网页linear邻接混合和连续三角插值。原4096RT/81tap模糊尚未接入，未称原作最终画面等价。小于气候格的细部降水响应仍有精度限制。
- 显示选择不写文档或存档；默认高度配色，刷新恢复默认。单纯模式切换不重建海岸；最多缓存3份派生气候快照。
- 异步启动/克隆/消息/计算/超时失败统一保留真正目标的高度视图、同步选项并允许重试，不回到旧地图。GPU更新异常另入错误态，可保存内存地图；不是气候降级成功。错误/乱序/超时有单元测试；未在浏览器注入故障。

## 真实检查与浏览器证据

- 最终 **30文件486/486相关测试、全src/tests/scripts lint、typecheck、生产build通过**；新增27个Worker/乱序/终止/缓存回归，既有459项保留。dist40个允许产物，build.json绑定20792cb；新biome.worker哈希产物为审查必需。计划11、发布锁22通过；相对f5b8371非webRebuild字段与首份门相等。未称全旧工程或云端CI通过。
- 初次typecheck的postMessage transfer签名失败已改为options.transfer，首次记录保留，最终检查全通过。本批只读子代理未启动，未把等待中的审计记作已复核；上批独立合流夹具证据保留。
- 开发40789点/80812面：统计与a200a00完全相同，518条接受河流/406点增湿分类变化保留；计算在Worker一次296.3ms。明确观察到pending=true时放大1.0→1.4。1.8秒窗口476帧、最大间隔50ms、一次53ms主线程长任务；不是完整性能基准或手机验收，未定位该长任务全部归因。
- 候选气候pending=true时取消，恢复原图后再次检查无迟到替换。428×926竖屏气候pending=true时切回高度，显示/状态正确且无横向溢出。原图/候选/缓存切换正常。
- 开发完整current/beforeProtection前后及刷新后相同；revision49、590保护点保留。初次冷计时/取消在最终提示文案收敛前，计算及控制代码未改；竖屏与最终生产为20792cb。未为本批功能写存档。
- 最终生产严格CSP下确认海岸 **37550→37705→撤销37550→重做37705→撤销37550**；重做pending=true时撤销，最终原分类完全恢复。原图对照正确；current及beforeProtection不变。测试脏历史页reload没有实际导航，未记通过；随后新页恢复并在干净页真实刷新，revision14/371锁点/height/无脏状态恢复。
- 桌面Chromium1280×720与竖屏尺寸仿真，**不是iPhone/Safari/WebKit或实际触控验收**。两端口本批复用，HTTP200/严格CSP不变，开发/生产warning/error为空。原包未执行。
- [本批合同](evidence/fms-climate-worker-v5-2026-10-05/CLIMATE_WORKER.md)、[统一检查](evidence/fms-climate-worker-v5-2026-10-05/checks.json)、[开发](evidence/fms-climate-worker-v5-2026-10-05/dev-browser.json)、[生产](evidence/fms-climate-worker-v5-2026-10-05/production-browser.json)、[指纹](evidence/fms-climate-worker-v5-2026-10-05/verification.json)，同目录有竖屏及当前页面截图。原数值合同见fms-river-climate-v5-2026-10-05/ORIGINAL_RIVER_FLUX.md，气候材质合同见fms-biomes-v5-2026-10-05/ORIGINAL_BIOMES.md。

## 原包恢复事实，续接不重复拆解

- 授权main.mjs的温度2584–2632、降水2635–2795、Biomes3638–3752及World参数桥接已独立恢复；5×26矩阵逐项一致。完整源/dump只在ignored .autopilot，不入dist。第三方Azgaar MIT/Alea notice保留并扩充选定气候规则范围。
- 本批又闭合reMarkFeatures2798、Rivers.generate2872、flowDown3001、defineRivers3037、alterHeights3115、实际fillDepression3190、calculateMoisture3727。resolveDepressions/Lakes气候调用在原活动路径中已注释，未误接。恢复合同记录源哈希、差异和数值夹具；无需重新拆包。
- World.Awake Resources.Load Materials/LandMaterial → ResourceManager13 → resources Material10 → Shader322 Unlit/LandShader；RenderBiomByProvince写入_MainTex=World.biomTexture。材质保存noise-rgb但编译shader不读取，未提取或导入无用图片。
- biomTexture → sharedassets0 RT204 Biom4096² → Camera10198 HeightBiomCamera(layer9) → GaussianBlur组件37454/Shader183。Start停用GO；CaptureImage调用Camera.Render；OnRenderImage单次81tap blit、alpha强制1。尚未完整追所有捕获触发事件，不称实时每帧或高度alpha仍保留。
- 场景气候初值与CalculateMapCoordinates0x6A3AB0已对齐核实；LatitudeOutput50是位移百分数，非50°。JS defineMapSize66/27不是当前FromWorld活动路径。
- Windows PE / Unity2021.3.36f1 / IL2CPP29。沿用户图片的索引→小函数/材质→网页切片→检查流程，未假称DWARF/ELF/hk4e-mcp；未运行完整原作、DLL或恢复脚本，未做原进程联调。

## 下一批实际绘图工作

1. 气候/河网Worker已接通，不重复迁移。优先有界恢复原河道meander/宽度网格，按当前真实流路适配可玩画面，改善细支流密度和缩放表现。原温度/flux/调色不重做；结合实际热点再优化主线程克隆、验证、GPU提交和河段绘制。
2. 补原生最终Biom捕获触发、SDF Camera10195海陆alpha输入；原4096模糊与网页连续混色差异要量化后选实现，不因有贴图就整包导入。
3. 海湾/岬角自然感、粗层级折角、最初主体轮廓永久锚点、原KD nearest tie/float桥接和手机主线程耗时仍未完成。继续不依赖人工门的绘图工程，用户确认方向后才扩系统。

## 本地入口与发布边界

- 分支codex/ph06-world-generation；既有remote https://github.com/Ethanhui6/lieguoji-web.git；hooksPath=.githooks。唯一Pages原生Git链lieguoji-web，main生产/其他分支预览。
- **禁止push/tag、远程PR/Issue/Milestone、上传及Pages触发。** 本地通过不等于云端CI或发布解锁。旧站未改，未另建部署链。
- 开发 http://127.0.0.1:5180/?fms=1 PID9420/tab1（停在气候地貌）；生产 http://127.0.0.1:5181/?fms=1 PID11808/tab3（恢复原存档高度视图）。旧标签已失效，本批新建。隐藏Node/Vite进程仅绑定127.0.0.1；不是手机或公网入口，不保证后续存活，续接先核实。
- 两origin独立lieguoji-fms-web-v1/DB2；未读写旧4173草稿。persistence没改，CAS、原子升级、backup v1归档、未来版锁写和多标签保护保留。完整存档不入Git/dist。
- 旧08:00之后用户直接继续请求已恢复本地授权；未创建/延长自动化，不声称会话结束后继续开发。
- 只读指定FantasyMapSimulator安装目录，不读认证/SDK/envs.log/个人存档；正式CANON/五国验收和历史范围保留。历史高度/海洋批次见Git8f81f5b版交接及各evidence目录。
