# 当前续接：v10 故乡重编已本地验收，准备开发预览

更新 2026-10-06T11:14:48.361Z。根任务独占写入；续接先核实 Git，再读 V5 / plan.tasks.webRebuild / 本文件。历史交接保留于 [v10前快照](evidence/fms-reorganization-v5-2026-10-06/AUTO_HANDOFF_BEFORE_V10.md)，历史现在时不可当当前回执。

- 当前基线提交605ad7e；本轮代码和检查将在紧接本记录的正常提交中，以实际 Git HEAD 为准。分支 codex/ph06-world-generation，私有仓库 https://github.com/Ethanhui6/lieguoji-web 。用户已确认GitHub＋Pages预览，保留正式站；本轮预览还没有上传。main保持b9b8f96，唯一Pages原生Git链，无Direct Upload或Actions部署链。
- v10 / fms-campaign-1 / Store12 lieguoji-fms-campaign-v1；指纹 5394c3c20077989a2eb2c243c7a686399e86c8dbfad8102bfbb3951d01019db0。旧v9完整44源归档且实际字节冻结，指纹eade9f19…dad不变；旧库继续旧规则。默认新局v10，明确“创建重编新版副本”才另建ID/库，保存原局不改。
- 合资格常备/手工军团实际被击溃后直接回故乡，一成兵力逐tick恢复，保留ID/兵种并清旧攻击路点；按当前人口和满编更新、小数余量保存，完成只记一次。可移动/交锋受伤。应急军、失守home、超home配额不重编，海上沉没载军不复活；补员中不可登船，预览/Worker一致。军队页真实进度和近景小条，空重编区不占屏。
- 原作费用gold/destiny/goldPerMonth、完整海上与home转属原生语义尚未移植；80士气/100补给是网页Init值。故乡失守停补并保留实际兵员属于明确适配。完整省内cell寻路、侦察埋伏、团师层级、自动远征和长期围攻平衡未完成。
- 检查：完整build:cf 220文件2690单元通过；24发布保护、15计划保护、lint/types/build通过，43白名单游戏产物。FmsApp约737kB体积警告保留。浏览器覆盖17案例，含首轮9个未受影响的地形入口/海军/动画、最终6个陆战/动员/重编复验、428×926的2个独立仿真；不是重新跑整个旧浏览器套件。首轮3个布兵守卫失败和修复保留。
- 上次已上传605ad：Pages success，URL https://52bdebad.lieguoji-web.pages.dev/?fms=1；Actions37437068346 failure（存储尾字节用例5000ms），本轮拆逐字节独立测试，保护断言/期限未改，云端待新回执。旧3e6取消任务37431669150的Atlas失败无附件（API实查0），250ms/500ms门保留、未宣称修复。
- 当前WEB-PH04仍in_progress，WEB-04-23仅有限切片done；WEB-04-13继续完整地形效率/长战/补给，之后按已恢复攻击选敌、港口和首都危机链推进。全部正式PH和iPhone13ProMax/用户报告iOS27/Safari与Chrome真机、用户视觉仍待验收。
- 只读原安装目录，不运行原作/恢复脚本，不读认证/SDK/个人存档；无新资源或依赖。详细边界与实际证据：[DELIVERY](evidence/fms-reorganization-v5-2026-10-06/DELIVERY.md)、[检查](evidence/fms-reorganization-v5-2026-10-06/checks.json)、[浏览器](evidence/fms-reorganization-v5-2026-10-06/browser.json)。
- 下一步正常候选隐私复核/指纹绑定/提交推送开发分支；上线后读真实build.json和HTTPS操作，Pages与Actions分别记录，不因更新回执重复push取消CI。保留用户5180/5181进程/标签/存档，会话结束后不声称后台开发。
