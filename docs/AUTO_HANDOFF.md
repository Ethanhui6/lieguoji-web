# 当前续接：Fantasy Map Simulator 网页重建 V5

更新：2026-10-04香港时间04:40恢复矩阵与沿海低地宽度检查点。先核实Git，读取CODEX_AUTOPILOT_V5.md、plan/tasks.json.webRebuild和本文件；接续代码，不重写计划、不重复已完成恢复。旧tasks/phaseState/programme保留历史要求，不提供执行顺序。

## 当前位置

**WEB-PH02 / WEB-02-01仍进行中。** 玩家保护/解锁与保存已接通，本批补齐恢复路径矩阵，新增1%—20%沿海内陆低地宽度。它不移动海岸线，不能代替海湾/岬角几何细化；后者仍缺，不标done、不提前启动WEB-02-02。下一批处理真正几何细化，不重做区域锁或宽度控件。

目标iPhone13ProMax，用户报告iOS27，Safari/Chrome，竖屏优先、原作风格、折叠工具。先验收绘图→自然化→连续缩放→修改/保存体验；真机和用户视觉门未过，不扩建国家、行政、家族、信仰。

heartbeat v5每30分钟续接，香港时间**2026-10-04 08:00截止**；到期先保存检查点、不开始新批。执行依赖本地Codex可用，不声称调度尚未执行的工作完成。

## 本批更新与证据

- 用户指出的backup恢复归档漏洞已在5f56088修复，本批核实并增强回归，没有重复改写persistence.ts。DB1 current损坏/缺失×beforeProtection不存在/已有，四条序列全部检查首次v2升级与第二次v2替换rolling backup后归档仍在；已有归档不覆盖。持久化49/49通过，CAS/原子失败/阻塞不迟到保护保持。
- “自然地形”新增沿海低地宽度1%—20%，默认3.5%。实际宽度还有1.8×平均点间距下限；大宽度降低内陆过渡起伏，固定海岸和玩家锁。预览显示本次宽度，UI告知参数仅会话有效、保存实际地形；刷新默认值不改已保存高程。
- 算法v4，Worker同时绑定比例与实际世界宽度；4固定样本默认高程与Git中5f56088/v3完全相同。4样本×2种子×4宽度32组独立交点/面积/剖面、锁点检查均0差异。宽度控件不增加海湾/岬角几何细节，未将它冒称轮廓细化完成。
- **11文件232/232测试通过，整体lint/typecheck、独立度量脚本与ESLint、源码绑定build/38产物通过。** 实际开发UI同源revision16/seed1337/同相机：1%预览取消→12%确认撤销重做→保存刷新revision19；8418点改变、590锁点0改变、1464交点0位移。生产20%Worker预览→取消→刷新，原checksum不变，warn/error为0。
- 本批截图仍有固定海岸高脊、河线折角，保护区与外围水文/阴影可改变。桌面Chromium CDP尺寸/键盘/鼠标证据，不是真机或用户视觉通过；无原作运行等价声明。

详见[本批报告](evidence/fms-coastal-width-2026-10-04/COASTAL_WIDTH.md)、[32组量测](evidence/fms-coastal-width-2026-10-04/measurements.json)、[浏览器](evidence/fms-coastal-width-2026-10-04/browser-checks.json)、[生产验证](evidence/fms-coastal-width-2026-10-04/production-browser.json)、[校验指纹](evidence/fms-coastal-width-2026-10-04/verification.json)。

## 前批区域锁证据（继续有效，当前算法v4与232项见上方）

- 折叠设置新增“启用并涂抹保护 / 涂抹保护”和“涂抹解锁”，共用半径；一次扩展到触及三角形的顶点，金色表面/边界显示。编辑及换种子生成避开锁点；锁定和解锁均可逐笔撤销重做、保存刷新。阴影/水系仍可能变化，UI已说明。
- 算法fms-shape-preserving-relief-v3，默认海岸继续fixed-linear-sea-contour-v1。固定混合三角形/恰好20高度顶点，其余陆点严格大于20；几何位移上限0。玩家锁是额外约束，不以mask测试冒充可见轮廓保形。
- 存档首次明确启用保护才变文档v2，首次保存v2与IndexedDB升级2同事务完成。普通v1原样运行。beforeProtection保留启用前有效v1（含从backup恢复场景），不被后续滚动备份覆盖；尚无独立手动归档恢复按钮。撤销全部保护不降格式。
- 旧客户端即使current损坏也会被DB版本拒绝；新客户端若恢复到DB2里的v1备份，明确告知缺少保护，禁止v1写回，须重新启用。并发CAS、失败回滚、阻塞放弃不晚写均已测试。
- **207/207相关测试、整体lint/typecheck、生产build与38产物白名单通过。** 开发浏览器590锁点不变、8225未锁点重生成；1464海岸交点位移0、逐三角陆地面积差0。解锁590→409→撤销590，保存刷新mask/高程一致。
- 生产371锁点保存后，旧193c3b4客户端保存被拒且checksum/存储计数不变。新Worker seed42生成候选→取消→刷新正常，无LegacyEntry加载，无warn/error。未跑全套旧游戏测试/云端CI。

详见[本批报告](evidence/fms-region-locks-2026-10-04/REGION_LOCKS.md)、[开发浏览器](evidence/fms-region-locks-2026-10-04/browser-checks.json)、[生产浏览器](evidence/fms-region-locks-2026-10-04/production-browser.json)和[验证指纹](evidence/fms-region-locks-2026-10-04/verification.json)。

## Git、产物与发布锁

- 路径D:/游戏/架空地图模拟器，分支codex/ph06-world-generation。批起点25d1c43；最终源码**28445d420772925aa800737ff530d3fd256375ca**。本文件与证据另作checkpoint提交，最终HEAD用git log -1核实。
- dist绑定28445d420772925aa800737ff530d3fd256375ca；build.json SHA256 **6e4972e9616ff055eed58fee6d0ad5e84696232ed2982435880ede3d451290cf**，38允许游戏产物，terrain.worker-Cs0rv54K.js。版本0.5.0-preview.33，仅本地开发切片。
- 只读核实remote=https://github.com/Ethanhui6/lieguoji-web.git，core.hooksPath=.githooks。既有Pages项目lieguoji-web，唯一原生Git链main生产/其他分支预览；历史URL https://lieguoji-web.pages.dev/ 本批未联网核验、未更新。
- **禁止push/tag、远程PR/Issue/Milestone、上传和Pages触发。** 9月24例外已消耗，发布锁/pre-push/生产CSP不变。V5完成不自动解锁旧全部PH门，不另建部署链。
- 除webRebuild外plan顶层字段与25d1c43一致；旧61任务/36PH/144子项和正式CANON/核图正史/长征要求保留。

## 本地入口和测试状态

- 开发 http://127.0.0.1:5180/?fms=1 （session65287），产物预览 http://127.0.0.1:5181/?fms=1 （session55887）；续接先查存活，不是公网或手机可访问URL。
- FMS惰性独立入口，不挂载RootApp/LegacyEntry，不创建旧640草稿；无?fms=1仍为旧入口。
- 命名空间lieguoji-fms-web-v1，名字未改但这两个测试origin现为DB2。5180文档v2 revision19/storedRevision10/590锁点；5181文档v2 revision3/storedRevision4/371锁点。均人工测试图，不是正式地图或用户真实存档。
- 旧4173保存atlas-17708eca-a8dc-465b-9763-8f82a1539ca6未打开/覆盖。当前开发IAB标签7标handoff，新增生产和旧版兼容测试标签关闭，临时viewport/device metrics已复位，临时页面探针已随刷新清除。

## 保留的海岸与自然化边界

前批[海岸合同](evidence/fms-coast-preservation-2026-10-04/COAST_CONTRACT.md)已复现旧v1问题：单点小岛面积剩40.7950%、细颈交点移5.028315单位。193c3b4建立0位移合同，本批v3维持；旧v1已经保存的收缩不自动恢复。历史证据不回写。

前批[自然化报告](evidence/fms-naturalization-2026-10-04/NATURALIZATION.md)保留：同源点/邻接距离低地与山系；priority-flood无环汇流与湖深，静态湿润水文网页适配，不是原作气候/侵蚀。候选独立、原图对照、取消/重试/超时、陈旧拒绝、WebGL丢失保护已验。旧文档格式不含地形参数，当前参数仍仅会话，高程和保护mask保存，水文派生重算。

当前36864点/1536世界单位不是最终大图。加载/编辑后的派生水文仍主线程；手机性能未测，模拟接入前仍需冻结水文版本合同。截图在1倍/2倍，仍有海岸细锯齿、河线折角与插值痕迹、海洋底色简单；不冒充4/16/40倍全验或原作相似度通过。

## 下一批直接开发

1. WEB-02-01剩余：海湾/岬角有界几何细化及显式范围。沿海低地宽度控件已实现，不能代替轮廓细化。固定三角网仅调高程不能增加边界细节；保留默认0位移，对新模式补可见轮廓位移/面积/宽海湾/狭颈/长岬/小岛的明确约束。不得仅解除混合三角形锁或以mask不变验收。
2. 该项完成后才做WEB-02-02：同输入、种子、相机的直接源地形/Atlas对照；定位重采样与海岸，再改善海岸、浅海/河口/湖边、连续缩放与4/16/40倍。不要强制新入口回旧Atlas。
3. 成批检查、修复和记录。WEB-02-03 iPhone13ProMax Safari/Chrome真实触控/性能及用户视觉由用户验收；桌面Chromium鼠标、CDP尺寸及前批DOM合成触摸不能替代。无新授权需要，发布仍锁。

## 材料与执行范围

只读授权D:/steam/steamapps/common/FantasyMapSimulator；不写安装目录、不读认证/SDK/envs.log/个人存档、不运行EXE/DLL或恢复main。raw/dump仅ignored .autopilot/fms-audit，不提交、不入dist；本批未读取新安装材料。

原数值/参照见docs/evidence/fms-brush-numeric-2026-10-04/verification.json、docs/FMS_REFERENCE_BASELINE_2026-10-04.md；绘图底座源码36bd1ac，旧产品基准42af5433保留。不重复恢复GetHeightMap/SetCellAsSea。原Collider、活动UI参数、拓扑、Unity RNG/powf逐位、海洋Shader/LOD和完整模拟仍未知，有具体必要再有界恢复。
