# 当前续接：权威日内行军与原作时钟

更新：2026-10-05。WEB-04-07首都辨识和连续运动显示已完成有限切片；用户要求即时战略，下一批WEB-04-09恢复原作时钟并实现真实日内移动/途中命令，随后WEB-04-08海军交战。显示插值不是完整实时规则。关键玩法优先例外有效；真机/视觉与全部发布锁保留。

## 已提交与可试玩

- 分支 codex/ph06-world-generation；当前源/真实构建bdb8c3bc159a6adfcc6336aac9fe6dde05cecad6；naval规则532842498fac9067d87ca2dfffd53188ccfd3bf1ca2b1277e08740fa02c63f79。后续证据/计划可能未提交，续接先git status，不覆盖他人修改。
- http://127.0.0.1:5180/?fms=1 ，专用试玩标签14暂停在14日，7舰队/8艘、71陆军，第一舰队实际返航中。已第二次保存rev2并刷新同runID fms-3891c8b9-be34-4bea-bd54-592ad8ca7989。原用户标签12未主动操作。续接先确认标签/端口，不假定未被用户改动。
- http://127.0.0.1:5181/?fms=1 已验bdb8c3b/532842；标签17加载旧21日，连续推进22日并保存rev2；最终标签18从保存恢复22日（同runID fms-6c5c77a7-9fa0-461a-b0f5-c4c0a0128ae5），暂停可玩。17重载后曾观察到0日新局，未覆盖其进度，另开18核实存档；两标签均保留，续接先核实当前UI。普通视口已恢复。电脑本机地址，不是手机直连网址。
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

## 已完成 WEB-04-07 与下一批 WEB-04-09

- 首都黑白同心环18 CSS像素/15px字，末层绘制；旧城与新首都迁移即时更新。原作prefab/Scale/按帧移动静态证据见 docs/evidence/fms-continuous-motion-v5-2026-10-05/DELIVERY.md。
- 陆军省中心拐点/海军湿边gate弧长运动；rAF只更新单位容器；暂停、变速、地图拾取和定位共用显示位置。分向军团独立，重叠军团可择军。Worker busy后重新检查剩余时间，防改速提前跨日。
- 新证据 docs/evidence/fms-continuous-motion-v5-2026-10-05：11文件105测试、lint/typecheck/build42产物；开发版同一日7陆军+2舰队各13个诊断位置；编译版22日连续位置/途中舰队拾取/保存刷新；428×926无横溢出。不等于原作等价/手机FPS/真机视觉。
- 规则指纹仍532842，未改模拟/格式。显示可能滞后权威日末，途中命令与保存仍取日末状态、刷新不恢复显示alpha；战斗重置可跳位置。WEB-04-09专门解决权威日内状态，不能以动画冒充已完成。
- 原作时钟静态联系已核实，见同目录ORIGINAL_CLOCK.md：TimeManager累计缩放deltaTime、跨日补算；Army/Navy连续消费缩放时间；默认日长0.1秒、七档倍率[.1,.5,1,2,3,4,5]，网页3秒/日为较慢适配。WEB-04-09处于in_progress（已核验，代码尚未接入）。下一步封存532842完整当前kernel+entry、闭合旧引擎依赖和存档dispatch后，开发新规则的子日推进、命令、CAS/恢复。完成后接海战。不要静默改Store4。

## 原作、后续与限制

- 指定安装目录只读，不读认证/SDK配置/个人存档，不运行原作或恢复脚本。实际PE/IL2CPP29，不是ELF/DWARF，未调用hk4e。DLL SHA d42658a922155f6cc60295a64c02207e5eaa1d3a55fd5ed18dc8ecc562f9b82b。
- 海军已核：港口海域资格0x497030、海格锚点0x418120、航行协程0x449600；allowLand=false/allowSea=true；BaseSpeed2.2原秒制。网页水面Dijkstra/费用/船员/巡航是适配；原作完整建港/海路偏好/海战/运输尚未恢复。
- 首都增强/连续运动显示已完成；权威日内行军与时钟随后，海战、跨海运输仍待做（登船/离船规则独立）。政体/联盟附庸/家族信仰/训练/长期平衡/PWA/真机视觉仍待做；历史计划与正式设定保留。
- 唯一未来云端链为私有Ethanhui6/lieguoji-web→Pages lieguoji-web原生Git，main生产；旧站https://lieguoji-web.pages.dev/未更新。无push/PR/Issue/Milestone/上传/Pages触发，不绕过pre-push，第三方素材许可仍单列。

只在本地推进授权工作，不声称会话结束后后台继续开发。
