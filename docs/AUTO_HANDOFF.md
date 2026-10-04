# 当前续接：Fantasy Map Simulator 网页移植 V5

更新：2026-10-04，本批原JS点击模板已接入。先读CODEX_AUTOPILOT_V5.md、plan/tasks.json.webRebuild并核实Git。下面旧原生Hill检查点只作历史，**当前优先级以本节为准**。

## 最新可玩切片

- 功能源码 **2d4d589a553e2da6202a748d3836860389774680**，当前HEAD另有证据checkpoint，续接查Git；上一批源码fd9f366/checkpoint ab94ce7保留。
- 顶部“原作地形”及折叠设置“原作局部地形”：**连绵大陆pangea（原点击默认）/高山大岛highIsland**。点击落点、拖动调整最后落点、松手Worker预览，对照/取消/确认、整步撤销、保存刷新。
- 原ClickToGenerateMap从centerCell取site，InitMapGenerationSettings用距四边归一化最小值、最大0.3f生成sizeFactor；**不使用笔刷半径**。原JS从零高度跑模板，再max(old,new)。先缩放长度再整数rand、原click幂次、Range/Trough与全图Mask/Add/Smooth保留。
- 海岸保护默认开启，固定所有海点/h20/混合海陆三角面顶点；关闭后允许新增陆地和扩展海岸。highIsland全图Add会改变远处海底，**不称局部圆形裁剪或保形**。玩家锁始终后置保留；已高地形不降低。
- pangea为原点击默认；highIsland选项、固定种子、海岸保护是网页扩展。d3拓扑、nearest首ID/double距离、Unity float桥接及原随机运行未逐格等价。完整来源见[click-engine.md](../src/world/recovered-terrain/click-engine.md)。
- 原海陆笔刷、闭合轮廓、原生Hill保留；网页保形自然化在设置“预览保形自然化”。不把全部算法称原作。
- **21文件405/405相关测试、整体lint/typecheck、真实生产构建通过**。旧seedTerrain指纹bc2eb3f4319ff9bf6d21c59faced9b75bca0f5c727cc8f6591493863d154915f不变；39允许游戏产物，build.json绑定2d4d589。
- 开发40789点/590锁：pangea337点抬高，9942跨海陆边交点比例偏移0、锁改写0、几何相同。取消存档相等、撤销/重做除revision完全一致。highIsland新增198陆地点/26768高度变化，海岸比例最大变化0.0555556（允许扩展模式）；原高度下降0、锁改写0。两模式保存刷新相等，beforeProtection不变。
- 严格CSP生产37550点/371锁：pangea144点抬高，2154跨海陆边交点偏移0，确认保存刷新完全相等，控制台无warning/error，真实Worker完成候选。浏览器是**428×926桌面Chromium、鼠标/键盘**，不是iPhone/WebKit/实际触控。
- **WEB-PH02 / WEB-02-01仍in_progress**，首份真机/用户视觉门未过，不扩建国家行政家族信仰，不解发布锁。

证据：[原函数/素材恢复](evidence/fms-click-template-v5-2026-10-04/ORIGINAL_RECOVERY.md)、[检查](evidence/fms-click-template-v5-2026-10-04/checks.json)、[开发浏览器](evidence/fms-click-template-v5-2026-10-04/dev-browser.json)、[生产浏览器](evidence/fms-click-template-v5-2026-10-04/production-browser.json)、[新岛陆](evidence/fms-click-template-v5-2026-10-04/new-island-saved.jpg)、[源码产物指纹](evidence/fms-click-template-v5-2026-10-04/verification.json)。本地检查不是云端CI或原进程联调。

## 下一批实际恢复入口

1. WEB-02-01内沿**实际活动海洋**继续：level0 World#8915/MeshRenderer#10199 → sharedassets0 Material#9 NoiseColor → Shader#191 Custom/UnlitWorldSpaceTilingWithNoise。不要再以resources Material#9 BlurOcean和OceanNew库候选为默认方向。
2. SetDeepWaterColor RVA0x6C23F0/SetShallowWaterColor RVA0x6C3700将同GO SDFTextureGeneratorExample._generator._sdfTexture绑定_MainTex；_DeepColor=shallowColor、_ShallowColor=deepParchmentColor是实际指令，不按名字反转。SDF Camera#10195与组件#38723共用RT#205 SDFLine1024²，threshold.5/Half/precision16。
3. **下一小范围：Shader#191 SDF采样规则、SDFTextureGenerator.Update RVA0x6EEBA0、相机绘制输入及刷新时序**。最终SDF尺寸仍未知，Half不足以宣称始终512²。原Ocean/图片仍未接入V5 renderer。
4. 原click参数、两模板、GetHeightMap已接入，不重复恢复。完整UI到点击生成的所有分支、Unity拓扑/KD tie、float桥接仍非等价。第一份真机/用户视觉不能代验，其余不依赖它的绘图恢复继续。完整国家城市行政家族信仰战争PWA需求及后续依赖不变。

## 当前本地服务、记录和边界

- 分支codex/ph06-world-generation，remote沿用https://github.com/Ethanhui6/lieguoji-web.git，hooksPath=.githooks。**禁止push/tag/远程PR/Issue/Milestone/上传/Pages触发**；9月24例外已消耗，唯一Pages原生Git链保留。
- 开发 http://127.0.0.1:5180/?fms=1 session99023/tab24；生产 http://127.0.0.1:5181/?fms=1 session73024/tab25。旧服务结束后本批重启，续接核存活；不是公网或手机可访问地址。
- 两origin各自lieguoji-fms-web-v1/DB2。旧4173草稿未读写。当前revision/storedRevision/checksum在本批browser.json，测试图保留，原始整图不提交/dist。
- 用户08:00后直接请求已恢复本地执行，不再次以旧截止停工；本批未延长自动化，不声称后台开发。root独占写入，只读子审计可并行。
- 安装目录只读，不读认证/SDK/envs.log/个人存档，不运行原作/恢复脚本；raw/dump仅ignored。第三方许可保留。存储代码本批未改，CAS/原子升级/backup v1归档/未来版锁写/多标签保护不退化。
- 粗海岸折角、简单海洋、总体观感未达用户要求；1536单位/36864基础点与50k上限不是最终大图。加密改变邻接，模板与河流水系仍有分辨率依赖，主线程快照/几何校验手机成本未知。真机与用户视觉待验收。

---

## 原生Hill历史检查点（当前入口、服务和下一批以以上内容为准）


更新：2026-10-04，原生Hill批次原生Hill接入。先核实Git，读CODEX_AUTOPILOT_V5.md、plan/tasks.json.webRebuild及本文件；旧tasks/phaseState/programme只作历史及发布审计。

## 最新授权与方向

用户在旧香港时间08:00截止之后再次直接要求“运用以前素材和生成方法，全方位移植网页端，按照图片方法”。**本地执行已恢复，不再等待解除旧截止。** 原调度时段结束，不代表重启或延长后台调度；本次未修改自动化。不要以旧截止重新停工，也不声称会话结束后仍后台开发。

目标仍为iPhone13ProMax，用户报告iOS27，Safari/Chrome，竖屏优先、原作风格、折叠工具。**WEB-PH02 / WEB-02-01仍in_progress**；首份真机与用户视觉门未过，不扩建国家、行政、家族、信仰。

用户截图流程按实际Windows PE/Unity IL2CPP转换：既有类型/地址/资源索引 → 有界恢复原函数输入输出 → 接网页可运行切片 → 数值/操作/画面对照 → 再扩展。暂无ELF/DWARF/hk4e-mcp，不假称用了。只读子任务可并行，root独占写入。不重复恢复已完成GetHeightMap/SetCellAsSea，不再把V5自研噪声等同原作方法。

## 原生Hill批次实际可玩变化

- 功能源码 **fd9f366c565aad7a8f6ee2e2c8ca64d3d990ae37**；当前HEAD以git核实，证据另作本地checkpoint。基线bfad048/旧源码fb8e821。
- 新入口：`/?fms=1 → 绘图设置 → 山丘 → 放置山丘`。在已有陆地点击，拖动调整单次落点、松手Worker预览；对照原图/取消/确认，确认后整步撤销与保存恢复。
- 真实调用原恢复 `generateFmsHillContributions`（GetHeightMap）和 `applyFmsHillBrush(max)`。既有平面画笔保留；上方“生成地形”仍是网页保形算法，不冒称已经换成原JS模板。
- 网页适配明确：圆与重建Voronoi相交、近点中心、文档存储邻接顺序、Alea种子流；非Unity Collider/随机流逐点等价。高度25—100、衰减0.8—0.98、默认85/.96是网页支持域，非原活动UI值；无静默clamp。
- 完整传播后再冻结海点/h20/混合海陆面全部顶点及玩家锁；保护点仍可传递传播。实际插值海岸固定，阴影和水文可以变化。Worker无写库，确认才commit；原CAS/原子升级/beforeProtection不变。
- 19文件367/367相关测试、整体lint/typecheck、生产build通过。首次类型声明失败已修复保留；计划记录曾把nextBatch写成文字，检查拒绝后改回V5 ID，未放宽检查。
- 开发实际40789点/590锁地图：山丘237处抬高；9942次跨海陆面边交点比例变化最大0，保护高度改变0，点/三角网完全相同。取消存档完全相等；确认→撤销保存与原地图除revision外相等；重做→保存→刷新完整存档相等，启用前归档不变。
- 生产实际37550点/371锁图：山丘232处抬高；严格CSP加载真实Worker、确认保存刷新完成，详见production-browser.json。build.json绑定fd9f366，仅39允许游戏产物。
- 浏览器是428×926桌面Chromium，实际鼠标/键盘。IAB不支持Input.dispatchTouchEvent，原生Hill批次未补成真实或合成触控通过；手机/WebKit/用户视觉未验收。

原生Hill批次：[原作来源和恢复结果](evidence/fms-native-hill-v5-2026-10-04/ORIGINAL_PORT.md)、[检查](evidence/fms-native-hill-v5-2026-10-04/checks.json)、[开发浏览器](evidence/fms-native-hill-v5-2026-10-04/dev-browser.json)、[生产浏览器](evidence/fms-native-hill-v5-2026-10-04/production-browser.json)、[源码产物指纹](evidence/fms-native-hill-v5-2026-10-04/verification.json)。本地测试不是云端CI，不是原进程联调。

## 原生Hill批次原函数/素材核对

- InverseVoronoiTransformPoint真实RVA0x6BADC0，105字节；每步float32的加偏移/除边界尺寸/乘地图尺寸，z未读。GetCellIndex真实RVA0x6B4E30，628字节，边界检查后KD最近点返回第一个结果。KD树构造/tie、真实Collider仍未知，网页已有地图域坐标不重复换算。旧0x43A1D9/0x43A29F是调用点。
- 原JS click生成是零高程跑完整模板后max(old,new)，不是从旧高度叠单Hill；centerPoint/sizeFactor及指数影响局部模板，当前engine固定参数且要求规则格点，不能直接把加密图伪装规则图接入。
- OceanNew材质#12→Shader#298 Custom/OceanUnlit：片元输出_Color，Stencil Ref2/Always/Replace，是蒙版链的一环；运行颜色未知。BlurOcean材质#9→Shader#242：17点十字模糊，总权1.772972979，原程序未归一化；RenderTexture、ScreenSize、颜色空间/采样和蒙版消费者待恢复。不能把任意噪声或Water_Cartoon_Min图集当原海洋。
- 已提取图片此前均未被V5 renderer消费。第三方来源、具体活动UI/材质消费者要逐项核对；完整安装包、dump、私密材料不提交/dist。

## 下一批：按原作移植继续

1. 在WEB-02-01内沿原JS click-template接口及UI设置调用，恢复centerPoint/sizeFactor输入与模板操作，再接当前V5候选链；保形策略与原生成器分开记录，避免又叠自研生成替代。
2. 核OceanUnlit颜色、BlurOcean实际RenderTexture/ScreenSize和Stencil消费者，恢复后再适配GLSL与资源；完整海洋/缩放对照仍依赖WEB-02-01。已有函数不反复重做索引。
3. WEB-02-03首份真机/用户视觉不能代验；其余不依赖它的绘图/素材恢复可继续。完整国家城市行政家族信仰战争PWA需求保留，依赖满足后逐模块移植。

## Git、发布与本地入口

- D:/游戏/架空地图模拟器；分支codex/ph06-world-generation。remote沿用https://github.com/Ethanhui6/lieguoji-web.git，hooksPath=.githooks。
- **禁止push任何分支/tag、远程PR/Issue/Milestone、上传、Pages触发。** pre-push/发布策略/CSP未改，9月24例外已消耗。V5完成不自动解除旧全PH门。唯一Pages原生Git链lieguoji-web保留，不另建替代链。
- 开发 http://127.0.0.1:5180/?fms=1，当前session26969；严格CSP产物预览 http://127.0.0.1:5181/?fms=1，当前session94966。旧服务失效已恢复，续接核存活；不是公网/手机可访问地址。
- 两个origin均独立FMS命名空间lieguoji-fms-web-v1/DB2，旧4173草稿未打开/覆盖。
- 开发最终v2 revision38/storedRevision18/40789点/590锁，checksum=4abb63f05bc1c6711069b54de01c4cfdb105c92cc2f56a28531acec58689f02e，beforeProtection仍v1revision10。原生Hill批次测试图保留山丘。
- 生产最终数值以production-browser.json为准，beforeProtection保持。原始完整测试地图不提交或dist。

## 既有约束与未通过项

海岸粗折角、简单海洋与整体观感未达到用户要求。1536单位/36864基础点、50k上限仍非最终大图。主线程选区/几何与面积水文校验的手机成本未知。

海岸固定合同是实际float32三角面h20插值，不以mask代替。加密/平滑每次最大偏移0—4，每正面积组件面积变动≤2%，对应点间距倍率[.8,1.2]；小组件边界、保护面固定，重复确认可累积；并非永久锚定初稿。面积汇流已改land-area-runoff-v2，但路径仍受邻接影响；当前数据派生水系，旧图加载可能改变视觉。

DB1有效backup归档路径已经修复：chosen current??backup保存首份有效v1，不覆盖beforeProtection，保留CAS/原子升级/失败不迟到写入；不要重复修同缺口。原schema/规则旧历史隔离、CANON未知、正式地图/正史和旧完整要求不变。

材料只读范围D:/steam/steamapps/common/FantasyMapSimulator，不读取SDK/认证/envs.log/个人存档、不运行完整原作或恢复脚本。raw/dump仅ignored .autopilot/fms-audit；第三方组件许可独立记录。
