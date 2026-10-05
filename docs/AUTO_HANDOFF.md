# 当前续接：省级持续围攻已接入，下一步原作效率/补给节奏

更新：2026-10-06。用户反馈“速度太快，占领一个地区不是直接全部吞并”，要求查原作。WEB-04-12有限切片已完成；下一批WEB-04-13原作围攻效率与持久补给，之后继续WEB-04-11自由战线/多军协同。不要将137测试或省抵抗条称为全面还原/最终平衡。关键玩法先行本地例外有效；真机/视觉门与云端发布锁不变。

## 当前源码和试玩

- 分支codex/ph06-world-generation；功能源码2926f3c，最终UI/已检查本机构建 **208d6b01dea1eadd2e8a6df0392659dee3cbef2b**；之后仅证据/状态提交。续接先核实git status。
- 实际本机页 **http://127.0.0.1:5181/?fms=1**，build.json核实commit208d6b0。交付标签22，已标记保留；旧标签18/20/21未刷新。入口“进入世界→继续围城版第39日”。当前暂停，昌邑步兵围攻南关。
- 当前 **v6 / fms-occupation-1 / 747f31323a5a6ee7ea3029566241863d6be5809a7fa710f7589941af76e90366**，独立Store7 **lieguoji-fms-occupation-v1**。
- 当前run **fms-e739c162-3a95-4297-bc7c-4ecd8f1a255b**，day39 07:00 / tick4715 / revision4；checksum **9aea2f57a3349520438c792248c569f69ff182bf8b0053fb1c26105c60dbf180**。南关p-5抵抗789.9012106742883/835.1089535236689，即已占领5.4133945827%；仍由曹实控。计划p-4→p-5→p-7，路点南关→泰顺，等待攻下本省。
- 5180是开发服务，不是最终构建证据。127.0.0.1是电脑地址，不是手机公网地址。

## 原作发现与本版变化

原包是PE/IL2CPP29；沿用户图片的索引→小函数→切片方法静态恢复。未执行原作，不读认证/SDK/私档，不写安装目录，raw/dump/完整包不提交或进dist。

- SetCurrentCell不转移土地；BattleInProvince按各军timer扣省battleScore，<=0才ConqueredBy；OnProvinceAdded只更新本省cells。原作普通占领同样在成功时一次转移本省，不是逐格涂色。
- 原max=max(1,本省cell数×200×省数/总cell×simulateFactor)，默认factor2；守军回补，攻击消耗。堡垒倍率增强守方/削弱攻方，无首都独立额外耐久证据。无人撤军不凭空恢复。
- WarSystemV2首都失守先登记、月检至少一月且敌仍控制才可能崩溃/吞并/内战，不是必然瞬吞；该完整服务尚未移植。
- 网页以实际多边形面积代替cell数，平均容量400；半网页日脉冲与现有兵员/士气/补给/地形/城防效率明确是适配。三个instant resolveControl入口仅对新规则停用；旧v5保留原样。
- 抵达后保持原国家底色、显示围攻条；攻扣守回，完成仅转移本省实控/一次经济归属。普通多段行军和连续路点均保留目标等待，AI不擅离围攻点；可撤退/讲和。
- 敌军驻点阻止征军/迁入首都、自动整军、造船/港口补给。攻下后法律归属保持，未开放新统合体系。

## 测试与证据范围

证据目录docs/evidence/fms-occupation-v5-2026-10-06：ORIGINAL_OCCUPATION.md、DELIVERY.md、unit/checks/build-check/browser.json、local-playtest.png与portrait-siege-focused.png。

- 12文件137相关单测、全局lint/typecheck、15计划与22发布策略测试、plan:check、构建/42产物审查通过。最终UI两文件lint/typecheck也通过。不代表全仓库/自动e2e/云端CI。
- 初次回归抓到非v5 copy参数遗漏（会重编旧v1/v2军队），已修并复测；普通行军跨敌区丢失后续目标也已修并新增回归。未知occupation字段两槽优先锁写、CAS/原子事务保留。
- 正常浏览器UI复制旧v5；推进至35日南关围攻3.3%，全56省控制仍未改变；半途保存→刷新→继续→再保存全run checksum一致，revision2→3。
- 自动时间tick4305→4715，地图diagnostic与详情进度同步3.3%→5.4%；最后暂停保存。攻下完成/只转一省/之后续行由单测证明，本次浏览器样本未耗尽完整抵抗。
- 428×926 Chromium仿真无横溢出、面板底742.4；显式定位军队后焦点(214,274.41)在面板上方。桌面缩窗后初始焦点曾落到面板附近，不能称响应式相机体验完整通过。
- 最终页无console warning/error；一次CDP载入等待超时后正常恢复。FmsApp620.98kB chunk警告保留；无稳定FPS结论。
- iPhone13ProMax / 用户报告iOS27 / Safari与Chrome真机未测；用户视觉仍pending。

## 兼容：新规则前先完整归档

- Store1 frozen0.4、Store2 preview1/military1、Store3 mobilization1、Store4 naval1、Store5 realtime1、Store6 battle1保留。v5 f50f完整13kernel+8entry已封存compat/battle1，哈希复算及运行分派通过。
- 本轮前后旧Store4 id fms-6c5c77a7-9fa0-461a-b0f5-c4c0a0128ae5/rev2/checksum45657379...不变；Store5 id fms-d674950a-0a6b-4693-ae60-20e0a9a9e589/tick2863/rev3/checksum422a8e49...不变；Store6 id fms-67d99f08-09b1-4114-8aac-4c8b4fffc463/tick3225/rev4/checksum73ae8a92...不变。完整对照在browser.json。
- **现在Store7/747f已有保存，后续改kernel/entry前先封存当前完整14kernel+8entry并注册旧规则；不要只换hash锁掉试玩。** 纯UI不改规则。复制另建runID/独立库，旧库不写。不导出或提交完整真实档。

## 下一批真实工作与边界

1. WEB-04-13：原作RecalCombatEfficiency不读armyCount，但当前网页沿用兵员模型；当前残军534人攻大省约157日、另一支缺粮残兵估计更长，尚非最终平衡。恢复每军效率、时钟/脉冲与持续补给，建立完好军/残兵/守军/堡垒的可玩耗时对照，避免瞬吞修复后变成长时间断粮围城。
2. WEB-04-11：自由战线、多军集结/分路/协同推进，已有连续路点不是战线系统。WEB-04-08海战/封锁、运输登陆仍待做；原作省内cell游走、首都事件/迁都联动、完整行政政体家族信仰/历史/PWA及正式设定仍未完成。
3. 云端锁与.githooks/pre-push未改：禁止push任何ref、远程PR/Issue/Milestone、上传、Pages触发。旧站未更新；唯一未来链仍私有Ethanhui6/lieguoji-web→Pages lieguoji-web原生Git。

保持本地单一主写入；只读审查可并行。会话结束不声称后台继续开发。
