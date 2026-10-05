# 当前续接：FMS 五类陆军、迁都与地方详情

更新：2026-10-05。用户优先体验关键玩法，最新要求是不同兵种、海军、迁都、外交/政体、家族信仰和缩放后的城市地方细节。**本批已完成五类陆军的有限可玩切片、征募、迁都和地方信息；海军/完整政体/家族信仰未完成。** 先核实Git、CODEX_AUTOPILOT_V5.md和plan/tasks.json.webRebuild，不重复提取已恢复词库/颜色/兵种/迁都。

## 当前源码与任务

- 分支codex/ph06-world-generation。军事功能提交146df66332ceeab51c652f4d881edaa10dc1c0f8；触控按钮修正及最终实际构建 **d4a0a80681a6218be6a2a7786222404a2931ad02**。后续提交仅本轮证据检查点；续接查询HEAD核实。
- 上一个标签/首都名修正1ea07be，词库/配色/操作66b204c；最初看海循环81b5d8d。
- WEB-PH04仍in_progress；WEB-03-01、WEB-04-01/02/03/04为有限子项done，**下一批WEB-04-05真实海路/港口/海军**。完整PH03/04、PH02真机视觉均未通过，不扩空面板。
- 用户本地关键玩法例外有效，原绘图和真实验收保留。第一体验门、旧tasks/phaseState/programme/releasePolicy未改。

## 当前如何试玩

- 开发入口：http://127.0.0.1:5180/?fms=1
- 最终生产构建本地预览：http://127.0.0.1:5181/?fms=1 ，已核实build.json绑定d4a0a80。二者存储origin独立，不是手机可直连地址。
- 编辑器“进入世界 →”后可开兵种版新局、继续兵种版、继续旧版、或明确从旧版创建兵种版副本。新局每国步兵/弓兵/骑兵三军团，原初始兵数拆分，总人数不增加；国家面板可以选择本国城市征募盾兵/精锐等、预览迁都。每个操作都有Worker重验。
- 地图显示不同兵种原作图标、人数/国色/行进标记；同点分排、点击选军、目标预览；1/3/7倍看海、逐日、战争暂停、事件筛选与定位保留。**当前位置按模拟日更新，连续帧步行动画尚未完成。**
- 城市只显示地名、金菱形首都；国家标签由实时实控主体领土重算。放大有乡野辖区名，所选地方卡读真实当地人口/人日粮/归属/驻军/邻接，不造不存在城市。
- 5180已知v1存档第147日revision1，checksum dd6050643835cc630f3cc2ae44b67b7a7be2782fed0b04361a5a6f1d84c0dd05；本轮v2测试保存第2日，迁都卫桦及盾兵/精锐可恢复。5181旧版第1日入口保留，兵种版第2日已保存恢复，淮夷首都安丰、零陵盾兵、骑兵抵达安丰。
- 标签11为保留的最终构建试玩；标签10曾用于开发验证，末次观察已到949日，**不是本轮验证命令推进的结果**，不覆盖或自动退出该活动状态。标签7/8是先前保留标签。标签/服务真实状态续接必须重查，不能假定用户未操作。

## 规则和存档兼容：必须保留

- 旧FmsRun v1永久用frozen0.4，指纹 **65333e9ed3fccd77c6e5bf32a9a3d0396df2990f2ad1ede7f952aec1217851c5**。原全局sim和既有frozen源码未改。
- v2外层rules=fms-military-1，实际源码指纹 **a3d9d4019fa04b21e9096e2a15aef442f36553d967cbed7fb486c5624077537f**，独立lieguoji-fms-play-v2。World内部schema2/.2是基础结构，**不能据此选择旧引擎**；按完整run的version/engine/units经military-registry/runtime派发。
- 已知开发预览46b5a571ed0d858eb652ebcd1772c36452482507adb774337f2b9e492965d7d6也已精确封存和注册。原因：HMR期间保存第2日测试档后指纹算法/事件说明改变，刷新正确锁写；按实际SHA还原其核心字节，保留原档与对应执行规则后恢复。绝不是放宽未知规则。档案在src/fms/play/compat/preview1，构建重验原指纹；不要修改它。
- 后续再改军事规则，先封存当前a3d9…完整依赖及执行/预览/操作，然后新增明确引擎注册。不能只改__FMS_PLAY_ENGINE__导致现在的v2被锁，也不能直接把旧engine改成新hash。参考本批归档，保持当前核图/保存/旧档保护。
- v1/v2分库、独立revision/CAS、摘要涵盖terrain/world/units、主备未来版本锁。所有Worker成功命令返回完整run；客户端不能只合并world丢兵种映射，也不能每步把国家选择重置首国。copy显式产生新runID，原军团赋步兵，不隐式随机分型。
- 征募克隆后扣地方人口/粮食、新军/units/事件一起校验提交；迁都只更新首都引用。共同重验day/nextEventId，成功递增事件号。

## 当前证据

`docs/evidence/fms-watch-controls-v5-2026-10-05/`：

- MILITARY.md为新功能/规则/兼容/未完成合同；military-provenance.json为5类配置与5图标摘要；military-checks.json及日志为新检查；military-browser.json及production-armies.png为实测。
- 本轮受影响7文件75测试、旧兼容/引擎/模拟/历史/存储9文件395测试通过；lint/typecheck通过；最终d4a0a80 build通过42产物白名单。没有把上批196文件2458测试记成本次重跑，没有完整旧Playwright e2e套件或云CI。
- 浏览器实测迁都、两类征募、兵种军旗、2日行軍/12补给、保存刷新、旧版继续入口、选择非首国推进后不重置、当地人口粮食。最终生产play/biome Worker加载、warning/error为空。
- 428×926 Chromium布局无横溢出；面板底742.4、时间条顶770.8、收起按钮44×44。恢复了viewport。不是iPhone13ProMax/Safari/WebKit或真实触控证据。
- 原先标签/颜色/事件切片记录仍在DELIVERY.md、checks.json、browser.json、naming-provenance.json。browser.json有真实147→154日国名重算证据；首次交战暂停由单元验证，147→560临时观看未观察到新交战，不算浏览器自动暂停通过。

## 只读原包恢复与下一批

- 授权安装路径D:/steam/steamapps/common/FantasyMapSimulator，仅限只读，禁止读取认证/SDK配置/个人存档、运行原作或恢复脚本。当前对象PE/IL2CPP，不是ELF/DWARF，未调用hk4e。
- 原作MilitaryProfile.json及5个PNG已有限复用；原作one Army = unitKey+armyCount。速度/基础战力/山地系数真实消费，完整biome修正/原战斗公式未恢复。即时征募成本、人数限额和初始拆军是明确网页适配规则。
- 已恢复手动迁都小函数0x467850，已定位自动补选首都0x5D4E00但触发时机未知。不要再次声称原作迁都收费或有冷却。
- 下一项海军：Navy.MoveToCell协程0x449600 → FindProvincePath0x8019E0(allowLand=false,allowSea=true) → FindCellPathInProvinces0x7FEBB0；独立舰队/港口/实际海路，不能用陆军直线穿海替代。有限舰船SVG已在资源索引中，尚未复制，可能含第三方Lucide来源。
- 后续政体：原作六类型Kingdom/Empire/Federation/Republic/Tribal/Theocracy；SetPoliticalSystem0x70D250→属性默认表→traits修正。完整数值待恢复。联盟实体/战争清理/陆海军调度链已定位，当前仅宣战讲和。家族、信仰、继承仍未实装。
- 动画连贯性、城市建筑/完整标注避让、自动补军、长期平衡、原作海岸观感、PWA和真机视觉继续未完成。用户求完整原作感觉，不能以本轮75测试冒充完整体验。

## 仓库与发布

既有私有GitHub Ethanhui6/lieguoji-web、Pages lieguoji-web；唯一原生Git生产链main/其他分支预览。旧站https://lieguoji-web.pages.dev/未更新。全PH发布锁、pre-push保持，**无push、远程PR/Issue/Milestone、上传、Pages触发**。只构建dist游戏产物。五图标的独立上游许可未逐项查清，保留来源未知；此处也没有解除发布门。

普通本地工作继续已有授权。没有索要密码/令牌或待新增云端授权；真机与主观验收需用户实际操作。会话结束后不声称仍在后台开发。
