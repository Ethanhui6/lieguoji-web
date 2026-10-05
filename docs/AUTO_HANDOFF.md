# 当前续接：日内版已可玩，下一批海军交战

更新：2026-10-05。用户关键玩法优先例外有效。WEB-04-09已完成下述有限切片；下一批WEB-04-08，继续原作已授权安装目录的只读方法核实与可玩适配。首份绘图真机/用户视觉门仍待验收，全部云端发布锁不变。

## 当前源与实际试玩

- 分支 codex/ph06-world-generation；最新源与实际本机构建 **91182cc0deeb04d9066045be45a67528c981add7**。证据/计划提交在其后，续接先git status，不覆盖其他修改。
- 本机构建页 **http://127.0.0.1:5181/?fms=1**；build.json已查91182cc及日内9b83。交付标签20；原用户旧标签18未操作。标签与服务状态须下次核实。
- 新世界为v4 / rules=fms-realtime-1；规则 **9b83e494682517f778c795e9676bc1fc2d53698710747b69a95be5900c45576d**。日内版独立Store5，旧世界选择“创建日内版副本”后体验。当前新runID fms-d674950a-0a6b-4693-ae60-20e0a9a9e589；最后保存第23日20:36/tick2863/rev3；曾在22日103/120保存并刷新精确恢复，随后手动跨日验证；各国lastLedger.day均23。
- 5180为开发服务，测试标签19已经关闭、未写Store5；目前源可能重新加载，不将其当已验证生产构建。两个网址都是电脑本机地址，不是手机直接连接网址。

## 本批实际功能

- 一日120tick，陆军progress、舰队海格位置是权威状态；常速目标3秒/日。Worker回复省去不变terrain；仅单位移动时不重建地图图层。
- 日内军令绑定day/nextEventId/tick，沿当前边走完再转向，保留当前位置，不能瞬移/原地折返。下一路口敌军拦路不能预览穿过。
- 实际到省中心节点接触敌军时双方停军，空敌地实际占领；同节点宣战先接触再移动。勾选交战暂停后停在首次接触tick，包括＋1日。当前伤亡仍日结，撤退离开交战节点只扣一次2.5%。路段中相向拦截、连续伤亡未实现。
- 粮账、补员、整军、外交/AI各日在边界结算一次。不能按每tick重扣。海战、登船运输尚未接入；完整历史回放仍待做，确定性分批/存档后下一tick相等不冒充回放UI。
- 首都高辨识标记、五兵种、人口粮食征募、动态整军、港口水路、舰队编成/巡航和迁都/外交沿用之前已接能力。

## 兼容与下一次改规则前的必做

- v1 frozen0.4：65333e9e，Store1 lieguoji-fms-play-v1。
- v2 46b5/a3d9：Store2 lieguoji-fms-play-v2，preview1/military1精确归档。
- v2 52f49：Store3 lieguoji-fms-mobilization-v1，mobilization1完整归档，仍执行其整军/补员。
- v3 **532842498fac9067d87ca2dfffd53188ccfd3bf1ca2b1277e08740fa02c63f79**：Store4 lieguoji-fms-naval-v1。本批已完整封存10kernel+7entry于compat/naval1并复算原hash；core/actions/navy/seaGraph/mobilize全部归档dispatch。
- v4当前9b83：Store5 lieguoji-fms-realtime-v1。本批已有真实保存；**下次改当前kernel/entry之前必须封存9b83组合，登记旧dispatch，不悄悄替换Store5规则。** UI纯显示另论。
- 复制v3换runID，保留陆军、经济、船员余粮及在途海路。各库CAS/主备/未知格式锁写不变，主备未来clock/navy字段不得通过回退绕过。内部运动只读共享地理；任何地理编辑必须另建副本。
- 5181旧Store4仍22日rev2/id fms-6c5c77a7-9fa0-461a-b0f5-c4c0a0128ae5/checksum45657379bfbe02af0a29f445667b358928daaf1d0ba68db4e76f9dfbdec7fe58，独立日内版两次保存后未变。未写入其他旧库或导出完整真实存档。

## 本批证据与边界

- **docs/evidence/fms-realtime-v5-2026-10-05/DELIVERY.md、checks.json、browser.json、desktop.png、mobile.png**。
- 10文件105相关测试、lint/typecheck、构建42产物通过；15计划、22发布策略测试通过。不是全量旧套件、自动e2e或云端CI。
- 编译页同日舰队各21位置、步兵11位置；在途舰队转港确认无位置重置。保存第22日20:36/tick2743后刷新，全部单位坐标精确一致；后续跨日结果看browser.json。
- 428×926 Chromium无横溢出；面板底742.4/控制顶770.8，普通视口已恢复；无console warning/error。**不是iPhone13ProMax/iOS27 Safari/Chrome真机，不是用户视觉通过，不是稳定FPS证据。**
- 首都/显示插值上一批证据docs/evidence/fms-continuous-motion-v5-2026-10-05；原作静态时钟链ORIGINAL_CLOCK.md继续有效：累计缩放deltaTime、跨日补算，默认0.1秒日长与七档[.1,.5,1,2,3,4,5]；网页3秒/日为较慢适配，非原作全链等价。

## 后续与发布

- WEB-04-08下一批：只读核实原作海军交战入口/损失/撤退，再做可玩接入与原因/存档；先完成上面的9b83归档。陆地沿边拦截另列后续范围。
- 指定安装目录只读：D:/steam/steamapps/common/FantasyMapSimulator。实际PE/IL2CPP29，非ELF/DWARF；未调用hk4e。DLL SHA d42658a922155f6cc60295a64c02207e5eaa1d3a55fd5ed18dc8ecc562f9b82b。本批未再次扫描/运行原作，不读认证/SDK/个人存档。
- 政体/联盟附庸/家族信仰/训练/长期平衡/PWA/真机视觉待做，旧完整范围与正式设定保留。
- 唯一未来云端链：私有Ethanhui6/lieguoji-web → Pages lieguoji-web，原生Git/main生产；旧站https://lieguoji-web.pages.dev/未更新。本批无push、远程PR/Issue/Milestone、上传或Pages触发；pre-push与发布锁保持。

只在本地推进授权工作，不声称会话结束后后台自动开发。
