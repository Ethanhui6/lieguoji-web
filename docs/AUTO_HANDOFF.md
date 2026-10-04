# 当前续接：Fantasy Map Simulator 网页移植 V5

更新：2026-10-04，原作海洋公式已接到真实地图。先读 CODEX_AUTOPILOT_V5.md、plan/tasks.json.webRebuild 并核实 Git；本文件当前状态优先于旧批次记录。

## 当前可玩结果与检查点

- 功能源码 **c6008b0fb346e3e7f604c844b76e13fbe09d4aed**；当前 HEAD 另有文档/证据 checkpoint，续接查 Git。原点击模板源码2d4d589、原生Hill源码fd9f366保留。
- **WEB-PH02 / WEB-02-01 仍 in_progress**；首份 iPhone13ProMax（用户报告iOS27）Safari/Chrome 真机与用户视觉门未过。不扩建国家、行政、家族、信仰。
- 原海陆笔刷、闭合轮廓、原生Hill、原点击模板pangea/highIsland、海岸保护、玩家锁、预览对照/取消/确认、撤销保存继续可用。
- 新海洋沿原活动 Shader191 的海岸距离 smoothstep 公式渐变，复用 level0 场景序列化配色数字和最大地图边2%宽度。海洋不再直接按海底高度混色。
- 网页从实际Float32三角网h20交线派生512最大边的RG16距离纹理，保持高度决定海陆边界。包括exact20边/接触点；排除Float32退化面。最多3份CPU字段/1个GPU source，完整几何缓存失效与销毁顺序已处理。
- **23文件420/420相关测试、整体lint/typecheck、生产build通过；计划11、发布锁22测试通过**。39允许游戏产物，build.json绑定c6008b0；旧seedTerrain指纹bc2eb3f4319ff9bf6d21c59faced9b75bca0f5c727cc8f6591493863d154915f不变。
- 初次测试有2.22e-16浮点严格零断言失败，改为1e-12容差；一次大纹理对象身份断言耗时超时，改为布尔身份比较后通过，未提高超时或删除检查。原始失败日志保留。

## 实际浏览器证据

- 开发40789点，5148岸段，首次距离场约65.5ms；绘制小岛后5241岸段，约74.6ms。1MiB活动纹理，CPU最多3MiB。只是桌面观测，不是手机性能PASS。
- 渲染更新前后完整已存地图相等；模板候选343点抬高，对照复用字段，取消不写存档。实际画小岛改变137点，撤销重做、1—80倍连续缩放，保存刷新完全相等；beforeProtection不变。
- 生产严格CSP、真实Worker轮廓平滑：37550→37566点几何替换，原图/候选/取消来回切换无纹理绑定警告；取消存档相等。再绘制135点小岛并保存刷新完全相等，归档不变，控制台warning/error为空。
- 浏览器为桌面Chromium，1280×720/428×926、鼠标/键盘；没有冒充iPhone、Safari/WebKit或实际触控。
- [原作恢复与适配合同](evidence/fms-ocean-v5-2026-10-04/ORIGINAL_OCEAN.md)、[检查](evidence/fms-ocean-v5-2026-10-04/checks.json)、[开发浏览器](evidence/fms-ocean-v5-2026-10-04/dev-browser.json)、[生产浏览器](evidence/fms-ocean-v5-2026-10-04/production-browser.json)、[源码产物指纹](evidence/fms-ocean-v5-2026-10-04/verification.json)。[本地当前画面](evidence/fms-ocean-v5-2026-10-04/local-playtest.jpg)；before/after同地图同相机图也保留。

## 原作恢复事实和明确差异

- 活动链 level0 World8915 / Renderer10199 → sharedassets0 Material9 NoiseColor → Shader191。编译程序没有噪声；_MainTex被运行时SDF替换，不要凭名字接AL-Noise图片。resources Material9 BlurOcean不是同一材质。
- SetDeepWaterColor0x6C23F0 / SetShallowWaterColor0x6C3700：_DeepColor=shallowColor，_ShallowColor=deepParchmentColor；Transparency/BorderDark均1。SetResolution边宽.02/scale；UpdateQuadUV0x6C9EB0两个轴按最大地图维度映射。
- SDFTextureGenerator.Update0x6EEBA0实际延伸至0x6EF545；源宽高按downsample整数除法，源1024²/Half时输出512²。Compute419 Seed按alpha分类、无半texel偏移；Flood为同UAV原地九邻域；Dist两轴按输出高度归一化。完整恢复见合同，不重复拆同一函数。
- **网页距离场是适配**：解析线段/BVH替代相机alpha栅格与原地GPU Flood，非逐texel等价；全空海取深色也是适配。当前保守纹理采样误差上界约4.242875地图单位，不是海岸几何位移。80倍颜色有软化，海岸原有折角仍明显。
- 原PlayerSettings为Linear；Unity材质颜色上传、帧缓冲/最终输出转换尚未恢复。当前仅复用场景RGB数字，**原作最终颜色/视觉一致未验证**。不猜测gamma，不将这套场景数值说成所有主题的默认。
- 原相机alpha具体绘制链、第三方SDF/Shader署名尚未确认；未导入完整原文件、dump或噪声图片，未运行原作/恢复脚本。

## 下一批（只推进依赖满足的绘图工作）

1. 在WEB-02-01内核对 **活动陆地材质/高度配色消费者** 与 **Unity Linear输出颜色链**，按小函数/材质恢复一个可玩切片。现有陆地绿色/阴影仍是网页适配，不能称全部原作画面已移植。
2. 有界核对SDF Camera10195如何绘制海陆alpha，以及失效刷新调用方；已恢复Shader191/Update/四kernel/UV/颜色设置不重做。
3. 保留原拓扑/KD nearest tie/float桥接、自然海湾/岬角、主线程与手机性能等未通过项；先用户确认绘图方向再扩建国家等系统。nextBatch只写V5任务ID，不写描述替代ID。

## 本地入口、存档与发布边界

- 分支 codex/ph06-world-generation；remote既有 https://github.com/Ethanhui6/lieguoji-web.git；hooksPath=.githooks。唯一既有Pages原生Git链 lieguoji-web，main生产/其他分支预览。
- **禁止push任何分支/tag、远程PR/Issue/Milestone、上传、Pages触发**；9月24单次例外已消耗。V5重规划/本地检查不解锁、不等于云端CI。
- 开发 http://127.0.0.1:5180/?fms=1 session32141 / tab26；生产 http://127.0.0.1:5181/?fms=1 session43552 / tab27。本批重启已失效服务，续接核存活。仅本机地址，不是手机或公网地址；旧Pages未改。
- 两origin独立lieguoji-fms-web-v1/DB2，旧4173草稿未读写。当前保存revision/checksum见browser.json，测试图保留；原始整图不入Git/dist。存储代码未改，CAS、原子升级、backup v1归档、未来版锁写、多标签保护保留。
- 08:00后的用户直接请求已恢复本地授权；本批未延长自动化，不声称会话结束后自动开发。root独占写入，只读子审计并行。
- 指定安装目录只读，不读认证/SDK/envs.log/个人存档；raw仅ignored .autopilot。正式CANON/五国地图验收、旧规则指纹/存档隔离及全部历史范围保留。
- 历史批次见[原点击模板](evidence/fms-click-template-v5-2026-10-04/ORIGINAL_RECOVERY.md)、[原生Hill](evidence/fms-native-hill-v5-2026-10-04/ORIGINAL_PORT.md)、[海岸保形合同](evidence/fms-coast-preservation-2026-10-04/COAST_CONTRACT.md)及Git86afe32版本AUTO_HANDOFF；不按旧国家行政开发顺序继续。
