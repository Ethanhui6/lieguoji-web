# 本批失败与修复记录

- 新单元首轮11通过3失败：夹具错误地把edit.nationId当作国家动态表属性比较，以及政治动作误用name而非nationId。修正夹具与完整对象预期，断言未删除；后续19项定向和全量2828项通过。
- 追加真实交锋夹具后typecheck发现对readonly units赋值；改为不可变复制。
- 首次独立产物审查缺少供审查脚本比对的public/terrain-licenses.txt；把原受审查文件复制到独立构建工作目录的public，未扩大dist白名单。最终43产物审查通过。
- Vite配置中本地TS导入缺扩展名警告已补`.ts`；大JS块警告仍保留。
- 首轮最终构建三尺寸6场景，5通过1失败；失败报告为browser-first-final-failure.json。桌面government收起面板后save轮询5秒超时，期望revision6、显示5。只读审计trace证实提交成功：底层call@354在142409.843ms已返回6，外层断言142548.520ms超时，测试侧143162.381ms才收到该完整结果并通过内部expect。每次完整世界结果约9,292,352 JSON字符。保存点击137538.301ms已完成；Presence退出160ms，距离关闭面板2.67秒后才点击，可排除退出遮挡。

不能从trace单独确定IDB回调耗时，evaluate含IDB、复制、序列化；可以确定本次数据库在期限内已有revision6，而完整结果传到断言端已超时。修复只将轮询改为同一原子事务写入的`saves.get('revision')`标量，保持5秒期限。提交后仍完整读取并精确比较run/checksum。没有为这次测试改变产品保存或放宽超时。三个设备政府流程重新执行，实际结果单列checks.json。

原失败trace保留在`.autopilot/upper14-evidence/browser-final/fms-upper14-FMS-v14-govern-e9ef2--tick-and-exact-restoration-desktop-chromium/trace.zip`。原首轮桌面4通过属于关闭编辑状态修复前构建；不冒充最终构建新测。未对全部历史浏览器套件宣称新一轮通过。

扩展桌面首轮8通过1失败：旧道路交战测试要求再过整整1日后战争列表仍非空。trace中call@745/pw:api@120是rev4/day1/tick120，p-40↔p-56上engagement-1仍存在，force-487/488分别2100/1900人且fighting；call@757/pw:api@129为rev5/day2/tick240，所有engagements/sieges/maritime.contacts与fighting为空，force-487剩616人继续marching，force-488为destroyed/0人，无reorganization。列表为空符合已结束的真实状态，并非UI漏项。测试改在已保存验证的实际contact时查看并选择对应道路交锋、验证2国；随后仍推进完整1日验伤亡、已结束提示、动员及精确恢复。未修改战斗公式或放宽伤亡/存储断言。首轮结果browser-extended-first-failure.json保留，修复后只重跑该场景。
