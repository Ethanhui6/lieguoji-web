# 当前续接：首都辨识与连续行军

更新：2026-10-05。港口/真实海路切片 WEB-04-05 已完成，本线程用户最新要求“首都不够明显、时间不要一格一格、即时战略感觉、继续还原原作其他功能”，因此下一批 WEB-04-07 优先处理首都与沿路线连续运动；随后 WEB-04-08 海军交战。只改实际功能，不重写计划。用户关键可玩优先例外持续有效，真机/视觉门及所有云端发布锁保留。

## 已提交与可试玩

- 分支 codex/ph06-world-generation；当前源/真实构建353a4e4fc8f6e82b620dba56546cb43c04eeea69；naval规则532842498fac9067d87ca2dfffd53188ccfd3bf1ca2b1277e08740fa02c63f79。后续证据/计划可能未提交，续接先git status，不覆盖他人修改。
- http://127.0.0.1:5180/?fms=1 ，专用试玩标签14暂停在14日，7舰队/8艘、71陆军，第一舰队实际返航中。已第二次保存rev2并刷新同runID fms-3891c8b9-be34-4bea-bd54-592ad8ca7989。原用户标签12未主动操作。续接先确认标签/端口，不假定未被用户改动。
- http://127.0.0.1:5181/?fms=1 真实生产构建已验353a4e4/532842，另一原稿局完成21日海程/刷新；临时标签15已关闭，存档Store4第21日rev1/runID fms-6c5c77a7-9fa0-461a-b0f5-c4c0a0128ae5。两个origin独立；这都是本机电脑地址，不是手机直连网址。
- 已接：五兵种/人口配粮征募/月度动态整军/补员/慢速3秒每日；真实港口和水域路径/舰队资源成本/按海格航行/靠港补粮/每15日自主巡航/被占港失去补给。

## 兼容：修改当前规则前必须封存532842

- v1 frozen0.4：65333e9ed3fccd77c6e5bf32a9a3d0396df2990f2ad1ede7f952aec1217851c5，Store1 lieguoji-fms-play-v1。
- 46b5预览和a3d9军事版为v2/rules=fms-military-1，Store2 lieguoji-fms-play-v2，精确归档preview1/military1。
- 52f49整军版为v2，Store3 lieguoji-fms-mobilization-v1；完整8kernel+7entry归档compat/mobilization1，仍执行归档mobilize→core，不得因新海军停止其补员/月度整军。
- 新532842海军版为v3/rules=fms-naval-1/navy.version1，Store4 lieguoji-fms-naval-v1。每库独立revision/CAS/主备/未来格式保护。未知海军版本或navy/fleet额外字段在回退前锁定。
- 新副本换runID，保留旧陆军/兵种/路线/经济状态且舰队为空，源旧库永不重写。新局按资源编初始舰队。不能只把旧指纹换成新指纹。
- 已存在532842的两个真实保存；下次改navy/sea-path/军事kernel或runtime/session/world/registry等指纹文件前先归档当前组合源码并登记独立旧规则与库。如果本批仅UI和纯显示插值，不需要改变模拟指纹。
- 5180旧Store1仍147日rev1/checksum dd6050643835cc630f3cc2ae44b67b7a7be2782fed0b04361a5a6f1d84c0dd05；Store2仍2日rev1/checksum d40b6906293e1146e7f2524942736005ab1e7347f8ec8ae5899facd00d92dd70；Store3仍3日rev1/checksum 20d903eb32d7b68bc76cc6ac19e8cdc89a4a2cd3f85615cd063dd941ec1214de。新两次保存后均未变。

## 最新真实证据

- docs/evidence/fms-naval-v5-2026-10-05/DELIVERY.md、browser.json、checks.json、desktop.png、mobile.png。
- 16文件531相关测试、lint/typecheck、15计划+22发布策略、build42产物审查。不是全量e2e/云CI。
- 5180预览407单位/124海格/12日，到港实际12日；余粮60→48，第13日港粮补为59日。手动造2艘扣80人/4800粮。14日航行中双保存/刷新同世界。
- 5181预览707单位/214海格/21日，实际21日到港；第15日各国自动巡航，被占港丢补给实际出现；21日刷新同世界。play/biome Worker和build.json已核对，两个标签warning/error为空。
- 428×926 Chromium无横溢出；面板底742.4/控制顶770.8；视口已恢复。不是iPhone13ProMax/iOS27 Safari/Chrome真机或用户视觉认可。
- 几何回归修复：h20陆脊不通、内部缺网格非外海、原点平移面积避免窄水面消减、省界/地形缓存不沿用错误港口；海军日结事件日期与粮账一致；未知字段有有效backup也锁写。极端Int32不能精确Float32的海军输入明确拒绝并保留原稿，不近邻猜岸线。

## 正在开始 WEB-04-07

- 最新指令优先首都/连续运动。首都使用专门标记/清晰文字层级；不得延长真实城市名来标身份。
- 军队/舰队必须沿prev→next实际经过路径插值；海军保留湿边gate，不能直连起止点穿过半岛。新增/覆灭/战斗/同日命令、暂停恢复要显式处理；绘制/拾取/定位共用显示位置。
- PlayMap.draw当前销毁并重建所有省界/文字，不能直接每帧调用。应只更新单位动态图层，静态地图按日/视图改变重绘。权威模拟/经济/保存版本保持，显示动画不写回存档。
- 只读子agent正核实原作首都prefab/Scale与陆军连续位移；不授权第二写入者。已知原作Navy2.2*deltaTime，不代表网页35单位/日等价。

## 原作、后续与限制

- 指定安装目录只读，不读认证/SDK配置/个人存档，不运行原作或恢复脚本。实际PE/IL2CPP29，不是ELF/DWARF，未调用hk4e。DLL SHA d42658a922155f6cc60295a64c02207e5eaa1d3a55fd5ed18dc8ecc562f9b82b。
- 海军已核：港口海域资格0x497030、海格锚点0x418120、航行协程0x449600；allowLand=false/allowSea=true；BaseSpeed2.2原秒制。网页水面Dijkstra/费用/船员/巡航是适配；原作完整建港/海路偏好/海战/运输尚未恢复。
- 首都增强/连续动画未完成，不将本记录当作已实施。下一项真实海战，跨海运输另定登船/离船规则。政体/联盟附庸/家族信仰/训练/长期平衡/PWA/真机视觉仍待做；历史计划与正式设定保留。
- 唯一未来云端链为私有Ethanhui6/lieguoji-web→Pages lieguoji-web原生Git，main生产；旧站https://lieguoji-web.pages.dev/未更新。无push/PR/Issue/Milestone/上传/Pages触发，不绕过pre-push，第三方素材许可仍单列。

只在本地推进授权工作，不声称会话结束后后台继续开发。
