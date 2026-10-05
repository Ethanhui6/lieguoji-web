# 当前切片：修正瞬间占领，WEB-04-12验证中

2026-10-06用户要求看原作占领节奏。已封存旧v5/f50f到compat/battle1；新增v6/Store7持续省抵抗，攻扣守回、面积容量、单省转移、普通/连续路线等待、围攻中的征军港口限制。137相关测试通过；最后修改后的统一静态检查/构建/浏览器尚待完成。首次lint发现测试变量prefer-const已修，不能引用未完成的最终检查。新库尚未写真实试玩档；现有Store6不覆盖。原作证据见docs/evidence/fms-occupation-v5-2026-10-06/ORIGINAL_OCCUPATION.md。云端锁不变。

以下保留上一批检查点以便核对旧档。

# 当前续接：持续陆战与连续路点已交付；下一批战线协同

更新：2026-10-05。用户明确“线路进攻两种都要，先做连续地点进攻”。本轮WEB-04-10有限切片完成，WEB-04-11自由绘制战线/多军协同为下一批；WEB-04-08海战仍待办。关键玩法先行本地例外有效，绘图真机/视觉门和全部云端发布锁不变。

## 当前源、试玩与存档

- 分支codex/ph06-world-generation；最终源码与本机构建 **6593a5efe956626e79e7c7dbd92c92c5af3ffd82**。后续只有证据/计划提交；先核实git status，不覆盖用户修改。
- 本机构建页 **http://127.0.0.1:5181/?fms=1**；已查实际build.json对应6593a5e。交付标签21，旧用户标签18/20未刷新。入口：进入世界→继续交锋版第26日；当前选中昌邑步兵，时间暂停。视口临时模拟已reset。部分截图接口超时，浏览器完整截图/帧率不能假称全部通过。
- 当前新世界 **v5 / fms-battle-1 / f50fbe73b6980108c33cebac67edc704d3910905170a53e11a932e287410351a**；独立Store6 `lieguoji-fms-battle-v1`。
- 当前run `fms-67d99f08-09b1-4114-8aac-4c8b4fffc463`，第26日21:00 / tick3225 / revision4，checksum `73ae8a9202465a98344d6a99073f4637e551718302f87e2491865dcc0db4d1fe`。当前两处交锋，昌邑步兵563对北安步兵226；进攻计划南关→泰顺暂缓。未确认撤退，没有修改真实旧世界。
- v5曾在tick3108战斗中保存/刷新/再保存；全run checksum完全一致，含小数伤亡、路段位置及连续计划。具体browser.json。
- 5180为开发服务，不能当作经本次构建验收的页面。127.0.0.1是电脑本机地址，不是手机网络访问地址。

## 当前实际玩法

- 一日120tick；道路扫掠接触和节点交锋，遇敌停军，0.1日一次同时伤亡，保存小数余量；经济/补员/补给仍每日单次，避免双扣。
- 1—8连续路点预览、基础行程/军粮与守军说明、确认、遇敌交锋、战后继续。和平取消无效敌对计划；手动撤退取消整条计划，边上沿原路保留位置且一次2.5%追击，节点无安全退路拒绝主动撤退。
- 原作二次Bezier方向箭头与实际道路细线分离；交锋标记、双方军旗、兵力条和状态卡由真实状态驱动。每次战损仅更新条/数字，避免全地图文字重建；仍不声称已达到稳定FPS。
- 本轮只读核实原作停军、省内交战、攻击间隔、伤害调用、箭头与battleFx，见ORIGINAL_COMBAT.md。原作省内cell游走、完整效率/AI、原生箭头生长/技能/围城尚未还原；道路拦截及0.1网页日脉冲为网页适配，非原作精确等价。

## 兼容：改规则前必须再次归档

- Store1旧frozen0.4；Store2 preview1/military1；Store3 mobilization1；Store4 naval1，均保留原规则。
- 上轮v4 **9b83e494682517f778c795e9676bc1fc2d53698710747b69a95be5900c45576d** 已在本轮修改前精确封存为compat/realtime1（12kernel+8entry），复算旧hash，core/actions/navy/graph/mobilization全冻结分派。
- Store5 `lieguoji-fms-realtime-v1` 仍id `fms-d674950a-0a6b-4693-ae60-20e0a9a9e589` / tick2863 / rev3 / checksum `422a8e49e580e27f54f42b9ae595ce7f296dec269d51eb603f5deca6d32d0c02`；Store4仍id `fms-6c5c77a7-9fa0-461a-b0f5-c4c0a0128ae5` / day22 / rev2 / checksum `45657379bfbe02af0a29f445667b358928daaf1d0ba68db4e76f9dfbdec7fe58`，浏览器前后对照未变。
- **当前f50f/Store6已有真实保存。下次改kernel/entry前，先封存当前完整13kernel+8entry，注册旧规则分派。不能用新hash替换Store6而锁掉当前试玩。** 纯UI显示改动无需变规则。
- 新版只能显式复制旧局并换runID，旧档库不写；保留CAS、主备、未来clock/navy/battles/engagement/plan字段锁写。不要导出/提交完整真实存档。

## 证据与未通过项

证据目录：`docs/evidence/fms-battle-routes-v5-2026-10-05/`：DELIVERY、ORIGINAL_COMBAT、checks、unit、browser、build-check，以及attack-route/contact/mobile-withdraw-preview截图。

- 11文件122项相关测试、lint、typecheck、15计划测试、22发布策略测试、构建与42产物审查通过；不是全量旧套件、自动e2e或云端CI。大chunk警告保留。
- 实际UI连续两地点确认、反向迎击、战斗暂停、分段损失、战中刷新恢复；最终构建确认框遮挡已修，无console warning/error记录。
- 428×926 Chromium：无横溢出；面板底742.4，控制顶770.8，撤退确认/取消可用。**不是iPhone13ProMax/iOS27 Safari/Chrome真机，不是用户视觉或原作等价通过。** 短时rAF采样前后均极稀疏，尚不能证明稳定FPS改善；后续继续测量而非宣布流畅。

## 下一批与发布

- WEB-04-11：用户已确认的自由绘制战线、多军真实集结/分路/协同推进；先建立预览合同和旧档隔离，不以装饰箭头冒充战线系统。微观游走/战斗表现与性能继续按真实证据优化。
- WEB-04-08海战/封锁、运输登陆；完整行政/政体、家族信仰、长程平衡、历史/PWA与正式设定/真机视觉仍待做。不能扩出全部空面板。
- 只读授权安装目录D:/steam/steamapps/common/FantasyMapSimulator；PE/IL2CPP29，不是假称ELF/DWARF/hk4e。未运行原作，不读认证/SDK/个人存档，不把原包/raw dump放进仓库或dist。
- pre-push和发布锁未改；本轮无push、远程PR/Issue/Milestone、上传或Pages触发。唯一未来链仍私有Ethanhui6/lieguoji-web→Pages lieguoji-web原生Git，旧站未更新。

只在本地推进授权工程，不声称会话结束后继续后台开发。
