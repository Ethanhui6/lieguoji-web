# 当前续接：Fantasy Map Simulator 网页重建 V5

更新：2026-10-04香港时间02:55 heartbeat批次，03:33检查点。先核实Git，读取CODEX_AUTOPILOT_V5.md及plan/tasks.json.webRebuild；旧tasks/phaseState/programme保留历史与完整要求，不提供执行顺序。

## 当前位置

**WEB-PH02 / WEB-02-01仍进行中。** 本批已接通“绘图→生成实际地形/河湖→对照原图→取消/确认→整步撤销重做→保存刷新”。收尾复核发现原计划还有“显式可调细化带”和“局部区域锁定”未实现，故不标done、不提前启动依赖它的WEB-02-02。不要只看新增函数/测试数量认为整个自然化已完成。

目标为用户授权Fantasy Map Simulator网页/PWA，忠实原作绘图、配色与工具。iPhone13ProMax、用户报告iOS27、Safari/Chrome、竖屏和折叠工具；原作风格替代旧iOS美术方向。真机和用户视觉门未通过，不扩建国家、行政、家族、信仰。

heartbeat v5每30分钟续接，香港时间**2026-10-04 08:00截止**；到期保存检查点、不开始新批。调度依赖本地Codex可用，不把尚未执行的工作当完成。

## Git、产物和发布

- 路径D:/游戏/架空地图模拟器，分支codex/ph06-world-generation。本批起点5995720，地形实现beffc5c、无变化候选修正632d7d5，最终源码**e044e460438a2a8de2d7ec3bd8f06ff071a3b75f**（界面保形表述收窄）。本文件及证据随后本地checkpoint提交，最终HEAD用git log -1核实。
- dist绑定e044e460438a2a8de2d7ec3bd8f06ff071a3b75f，build.json SHA256 **d3517b0d6bf9131ee50cdeb7ca61e60059ecbd5763dd06194ea51f0f9ea31277**；38个允许游戏产物，独立terrain.worker-CVvvBpES.js。版本保留0.5.0-preview.33，仅本地开发切片，不是新发行。
- 本批只读核实remote=https://github.com/Ethanhui6/lieguoji-web.git，core.hooksPath=.githooks。既有Pages项目lieguoji-web，唯一原生Git链main生产/其他分支预览。历史URL https://lieguoji-web.pages.dev/ 本批未联网核验、未更新。
- **禁止push/tag、远程PR/Issue/Milestone、上传和Pages触发。** 9月24例外已消耗，发布锁/pre-push/生产CSP不变。V5完成不自动解锁旧全部PH门，不能另建部署链。
- 除webRebuild外plan全部顶层字段对比5995720保持一致，旧61任务/36PH/144子项和正式CANON/核图正史/长征要求保留。最终保护与指纹核验见verification.json。

## 本地可操作入口

- 开发 http://127.0.0.1:5180/?fms=1 （session65287），dist预览 http://127.0.0.1:5181/?fms=1 （session55887）。本批已实际打开，续接先检查存活；不是公网或手机可访问URL。
- FMS通过main惰性分流，不挂载旧RootApp，不创建旧640草稿；无?fms=1仍是旧入口。生产FMS页未加载LegacyEntry。
- 独立数据库lieguoji-fms-web-v1。5180测试世界revision9、9985陆点、最高100、631河段、11湖点；5181为revision2、1362陆点、最高81、154河段、0湖点。不同origin独立，均人工测试图，不是正式地图或用户真实存档。
- 旧4173保存atlas-17708eca-a8dc-465b-9763-8f82a1539ca6未打开/覆盖。旧服务状态需现场核实。当前IAB开发标签已标handoff；新增生产测试标签已关闭，临时viewport/device metrics已复位。

## 本批实现及证据

见[自然化报告](evidence/fms-naturalization-2026-10-04/NATURALIZATION.md)、[实际浏览器记录](evidence/fms-naturalization-2026-10-04/browser-checks.json)、[Hill试验](evidence/fms-naturalization-2026-10-04/hill-trial.json)、[验证与指纹](evidence/fms-naturalization-2026-10-04/verification.json)。

- 同源坐标/邻接生成距海低地与多尺度山系，Int32真实高程。海点原值和每点海陆分类不变，保护采样岛/湾/狭颈拓扑；**不保证三角插值海岸逐像素不动**。UI已改为“保留主体海陆布局”。
- 确定性priority-flood计算最低溢流面、无环汇流与湖深；陆点贡献一份汇水，无海组件有明确内流终点。河线来自达到阈值的邻接边。属于静态湿润水文适配，不是气候/侵蚀/原作动态水系。
- 自然化Worker支持取消/重试/超时、陈旧结果拒绝。候选独立，确认一笔历史，取消不改文档；原图/地形对照，导航可用、预览锁保存/编辑。WebGL丢失取消候选，已提交图仍可保存。
- 种子/强度在折叠设置，全强度同形状同种子幂等。完全相同结果直接反馈，不建空预览。参数仅会话设置；存档保存高程，派生水文重算，原格式及旧Atlas隔离不变。
- 同一36,864点样本试验恢复Hill Add/Max：Add有163点超100，Max有97.19%陆点保持原底板；当前自然化无mask/范围违例，底板1.39%。支持当前默认选择，不能推断其他Hill参数不可用。未运行原作。

## 检查与剩余边界

- 8文件181/181测试通过，03:08:54开始、1.87s：原121及新增自然化19/汇流17/Worker21/候选事务3。汇流含独立最低溢流、无环和守恒参照。
- 整体lint/typecheck通过，UI收尾局部ESLint通过；未改算法的收尾复用数值测试。最终源码绑定本地构建与38产物白名单通过。未跑整套旧游戏测试或云端CI。
- 真实Chromium测试生成/原图对比/取消/确认/撤销重做/保存刷新；生成下一动画帧取消且可重试；WebGL丢失后候选不落盘，刷新恢复已提交高程与水系。严格CSP生产Worker生成、保存恢复通过；最终构建读回提交正确、无warn/error。
- 428×926截图观察山系、沿海低地和派生河湖；近景仍有细锯齿海岸、河线折角、插值痕迹，海洋仍简单底色。当前只约2倍观察，不是WEB-02-02规定的4/16/40倍全验证。
- 前批触摸为DOM合成PointerEvent，真实鼠标另验；本批也不是iPhone/WebKit。真机Safari/Chrome、用户相似度、性能均待验。
- 36,864点/1536世界单位不是最终大图。候选生成在Worker，加载/编辑后派生汇流仍主线程；模拟接入前需冻结派生水文版本合同。
- **WEB-02-01还缺可调细化带和局部区域锁定；整项未完成。** WEB-02-02对照/海洋/全缩放和WEB-02-03首份门均未通过。

## 下一批直接开发

1. 仍做WEB-02-01：显式海岸细化带参数、玩家局部锁定区域；锁区换种子不重掷高程，预览/确认/撤销/保存同一合同。保护宽海湾、狭颈、长岬和小岛，补固定不对称样本。
2. 上述通过后，WEB-02-02使用同一输入、种子和相机做直接源地形/Atlas对照，定位重采样/海岸问题，再改善海岸、浅海/河口/湖边及4/16/40倍与连续过程。不要强制新入口回旧Atlas。
3. 成批后做相关实际检查并落证据；真机/视觉只交用户。门前继续绘图，不用国家空面板替代体验。

## 原作材料与历史

只读指定D:/steam/steamapps/common/FantasyMapSimulator，不写目录、不读认证/SDK/envs.log/个人存档、不运行原EXE/DLL或恢复main。raw/dump仅ignored .autopilot/fms-audit，不提交、不入dist。本批只用项目已有恢复高度核，未读新安装材料。

原数值/参照：docs/evidence/fms-brush-numeric-2026-10-04/verification.json、docs/FMS_REFERENCE_BASELINE_2026-10-04.md；前批绘图证据docs/evidence/fms-drawing-entry-2026-10-04/，源码36bd1ac；旧产品基准42af5433保留。不重复恢复GetHeightMap/SetCellAsSea。原Collider、活动UI参数、原拓扑、Unity RNG/powf逐位、海洋Shader/LOD和完整模拟仍未知，有具体需要再有界恢复。
