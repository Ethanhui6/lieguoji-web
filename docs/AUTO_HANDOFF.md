# 当前续接：Fantasy Map Simulator 网页移植 V5

更新：2026-10-05，已接入原河道弯曲/原生切线与逐点渐宽的网页切片。先读 CODEX_AUTOPILOT_V5.md、plan/tasks.json.webRebuild 并核实Git；本文件优先于旧批次记录。

## 当前检查点

- 功能源码 **518913a29630c1a9c8d0d493395427c667576232**。之后为证据文档checkpoint，续接查Git。本批开始0a204f0；上批Worker20792cb、原flux a200a00、气候入口235224d/ef4aad5、高度3420537、海洋c6008b0、点击模板2d4d589、原Hill fd9f366保留。
- **WEB-PH02 / WEB-02-01仍in_progress**，nextBatch仅WEB-02-01。iPhone13ProMax（用户报告iOS27）Safari/Chrome真机及用户视觉门未过，不扩建国家、行政、家族、信仰。
- 原海陆笔刷、闭合轮廓、原Hill、pangea/highIsland点击模板、海岸保护/玩家锁、候选对照/取消/确认、撤销和存档兼容保留。

## 本批实际恢复与可玩变化

- 原活动JS addMeandering产生确定性内陆弯曲点；实际Unity桥只传xy，未把flux传给绘制。JS getRiverPath/getOffset虽存在，却未在当前活动绘制链调用，不能用它冒充原渲染。
- 有界静态恢复World.DrawRiver → BorderDataProcessor.GetLineVertices → StateLineRenderer.SetRiverLines/DrawSingleRiver → BuildRiverPath。原生沿路径设置(.7+i*.7/N)*1.5厚度，切线为normalize(next-prev)、柄长为段长×curveAmount。
- 使用原构造默认curveAmount=.5及1.05至小于2.1渐宽。**场景序列化覆盖、World.VoronoiTransformPoint和Prefab总尺度还没核实**；网页一地图单位映射一宽度单位、Math.round/6–12采样是明确适配，颜色仍为网页原值。不称完整原作外观等价。
- 原接受河流路径直接产生曲线，flux/receiver/riverIds/降水与增湿分类未变。只有气候地貌使用新河带；高度/阴影视图仍为面积汇水水系。
- 海岸混合面一环内保留直段，固定真实Float32 h20河口，避免细颈被弯曲切断。整个河带（包括宽度）在Worker中裁到对应陆地三角面，防止粗线越海；不移动地形或锁定点。
- 单个非索引Mesh绘制河带；输出增加第9个派生TypedArray转移。保留Worker取消、迟到结果拒绝、3份缓存。每份河带最多12MB，另有每点/裁剪工作预算；超限走现有高度降级，可重试。输入/历史数组不转移，存档格式未改。
- 当前画面仍有密集支流、靠海直段、湖边折角；7.5×实际截图有记录，更极端缩放、GPU耗时和手机内存未验收。本批未改UI布局或扩系统。

## 真实检查与浏览器证据

- **31文件496/496相关测试、lint、typecheck、生产构建通过**；新增6项形状/海岸＋4项Worker异常测试。独立重心坐标oracle检查整河带三角形位于真实陆地面，覆盖21→0小岛、亚单位宽细颈/逐截面连通与合流。浮点容差见合同，未声称像素零误差。
- 首次typecheck可空shader报错已修复，仅重跑lint/typecheck；496测试沿用本批真实首次时间。两次checkpoint因先引用、后生成证据文件的顺序错误而失败，保留完整证据后重验通过；失败日志保留。没有删除或跳过检查。只读子代理仍未启动，已停止等待，未记独立审查通过。
- 生产40个允许产物，build.json绑定518913a；严格CSP（script/worker同源）下新Mesh、Worker正常工作。计划11、发布锁22通过；旧任务字段与首份门相对0a204f0保持不变。
- 开发40789点、518条接受河流、2595河点、406处增湿分类变化保持原值；新河带4028曲段/308245三角形/7,397,880字节。一次Worker435.3ms，仅桌面样本。
- 同一生产地图/2.7×相机前后对照：37550点、192条河、740河点、25处增湿变化不变；粗直段变渐宽曲线。新河带83074三角形/1,993,776字节，一次Worker264ms。
- 生产海岸候选37550→37705，河带83074→85443三角形；查看原图恢复原河带，确认后计算中快速撤销/重做/撤销，最终原图恢复；另等待一次重做完成恢复候选，再撤销恢复原图。没有用pending时暂为空的河带计为绘制通过，JSON分别记录即时和完成态。
- 428×926竖屏仿真检查2.7×/7.5×、折叠工具与无横向溢出；开发真实刷新回40789点/590锁点/默认height。两origin主档和beforeProtection整包只读摘要前后相同；生产新干净标签恢复revision14/371锁点。未保存测试改动，未输出完整存档。
- 桌面Chromium控制台warning/error为空；**移动尺寸仿真不是iPhone/Safari/WebKit/实际触控验收**。未运行原包或恢复脚本，未做原进程联调。
- [本批合同](evidence/fms-river-shape-v5-2026-10-05/ORIGINAL_RIVER_SHAPE.md)、[检查](evidence/fms-river-shape-v5-2026-10-05/checks.json)、[生产](evidence/fms-river-shape-v5-2026-10-05/production-browser.json)、[竖屏](evidence/fms-river-shape-v5-2026-10-05/dev-browser.json)、[刷新](evidence/fms-river-shape-v5-2026-10-05/refresh.json)、[指纹](evidence/fms-river-shape-v5-2026-10-05/verification.json)，同目录有前后及竖屏截图。

## 原包既有恢复，勿从头重复

- Windows x64 PE / Unity2021.3.36f1 / IL2CPP29；按用户图片执行索引→小函数/材质恢复→网页切片→真实检查，不假称ELF/DWARF/hk4e。完整dump/资源仅在ignored .autopilot。
- main.mjs温度2584–2632、降水2635–2795、Biomes3638–3752及World参数桥、5×26矩阵已核；reMarkFeatures/Rivers.generate/flowDown/defineRivers/alterHeights/实际FIFO fillDepression/calculateMoisture已适配。未误接原活动路径注释的resolveDepressions/Lakes气候。
- 真实图降水映射、haven=-1、沿海距离127封顶、图边界是网页适配；每点flux随图密度变化，不是面积守恒物理流量。气候最长边192格，最终顶点温度使用自身高度。原初始north/south=.9/-.9、PrecInput80、offset0；seed1337为网页选择。
- World.Awake→Materials/LandMaterial→ResourceManager13→resources Material10→Shader322 Unlit/LandShader。RenderBiomByProvince写_MainTex=biomTexture；未使用的noise-rgb未提取。
- biomTexture→sharedassets0 RT204 Biom4096²→Camera10198 HeightBiomCamera(layer9)→GaussianBlur组件37454/Shader183。Start停用GO；CaptureImage调用Camera.Render；OnRenderImage一次81tap blit、alpha强制1。**最终捕获触发链、SDF Camera10195海陆alpha还没闭合**；网页连续混色不是原4096RT最终效果。
- 原场景气候与CalculateMapCoordinates已核；LatitudeOutput50为位移百分数。历史详细记录见Git0a204f0版交接及fms-climate-worker/fms-river-climate/fms-biomes/fms-land-material各evidence目录。

## 下一批实际工作

1. 有界核实World.VoronoiTransformPoint、河流Prefab厚度/缩放与场景curveAmount，校准本批显示尺度；量化支流过密和河带几何成本。不要重做已接通的气候Worker/flux/曲线规则。
2. 接续最终Biom捕获触发、SDF Camera10195输入；比较原4096模糊与网页连续混色后选具体实现，不整包导入素材。
3. 海湾/岬角与湖岸的连续观感、最初主体轮廓永久锚点、原KD nearest tie/float桥接、手机主线程/GPU/内存仍未完成。继续不依赖人工门的绘图工程。

## 本地入口与发布边界

- 分支codex/ph06-world-generation，既有remote https://github.com/Ethanhui6/lieguoji-web.git，hooksPath=.githooks。唯一Pages原生Git链lieguoji-web，main生产/其他分支预览。
- **禁止push/tag、远程PR/Issue/Milestone、上传及Pages触发**。旧站未改，本地通过不等于云端CI或发布解锁，未另建部署链。
- 开发 http://127.0.0.1:5180/?fms=1 / tab1停在气候2.7×；生产 http://127.0.0.1:5181/?fms=1 / 新tab4恢复已存高度图，测试旧tab3关闭。仅127.0.0.1，不是手机/公网地址，续接先核实进程存活。
- 两origin独立lieguoji-fms-web-v1/DB2；不碰旧4173草稿。CAS、原子升级、backup v1归档、未来版锁写和多标签保护保持。真实存档不入Git/dist。
- root独占写入；只读指定原安装目录，不读认证/SDK/envs.log/个人存档。用户直接继续请求已恢复08:00之后本地授权，未延长自动化，不声称会话结束后后台继续。
