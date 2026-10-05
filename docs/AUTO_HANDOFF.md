# 当前续接：动态整军、紧凑军旗与慢速看海

更新：2026-10-05。本轮用户要求解决固定三军、图标挡视野、推演过快。对应本地切片已验证。用户“关键玩法先行”的V5例外继续有效，下一批为真实海路／港口／海军；不要重复提取词库、颜色、五兵种或重写计划。真机／视觉体验门和全部云端发布锁保持。

## 当前代码与试玩

- 分支 codex/ph06-world-generation；源码及实际构建 208480c45ef76d398a253019450037ead9e06f7e。后续为证据提交，续接先核实Git、CODEX_AUTOPILOT_V5.md、plan/tasks.json.webRebuild。
- 新规则指纹 52f49f7ff95ea717d0f9f19c2f2efb3a86861f0fe7f49e62b41212a357ee50ef。
- 推荐试玩 http://127.0.0.1:5180/?fms=1 ，标签12保留：六国大陆77支军团，第3日已保存刷新恢复，梁21支／目标上限30；暂停、常速3秒/日。下次先重查标签／服务，不假定未被用户操作。
- 生产构建本地预览 http://127.0.0.1:5181/?fms=1 ，实际build.json已核对208480c与52f49。该origin原稿是另一张小而贫困的细长地图，39日时4支存活军；39日已保存刷新。专用验证标签13已关闭，用户旧标签11未操作。
- 两个origin存储独立，是当前电脑本机地址，不是手机直连网址。旧Pages未更新。
- 进入世界可继续整军版／旧兵种版／旧版，或开新局。旧v1/v2可明确“创建自动整军版副本”，保留源世界。继续旧版仍按旧规则，不能期待旧版获得新自动征募。

## 本批实际范围

- 常规军上限参考原作floor(自有实控辖区×2/3)，网页每国30／全球含历史军团500。和平与民生国策目标降低、战时提高；资源不足时可以少于三支甚至为零，不保证每国都超过三军。
- 新局兵员来自实际地方人口，五兵种按原权重分配并分散驻扎。每30日检查缺额；每5日给安全自有辖区内idle军渐进补员。新兵扣实际人口与足额配粮，保留100居民和十日民粮。行军／交战／敌占驻地不能补员。
- 整军在下一日日结前执行，事件写明边界（例如第30日日结前的事件归第29日末），后续账本读真实粮库。逐日携带完整world+units，整批成功才替换状态。
- 远景12px小旗合并附近同国军队，数字为军团数；近景18px原作兵种图，选中24px和人数，22px拾取半径。敌国不合并，屏外军旗不画。国家军团列表折叠。
- 默认3秒/日，另有6／1.5／0.75秒；各档每次只走1日，Worker忙时不堆积请求。隐藏暂停、逐日和交战暂停保留。连续帧行军动画仍未实现，位置随日结更新。

## 旧规则与存档保护

- v1永久frozen0.4：65333e9ed3fccd77c6e5bf32a9a3d0396df2990f2ad1ede7f952aec1217851c5，lieguoji-fms-play-v1。
- a3d9d4019fa04b21e9096e2a15aef442f36553d967cbed7fb486c5624077537f在修改前完整封存src/fms/play/compat/military1：7kernel可执行、7entry为.source，按原路径／顺序／归一化源码重算完整组合指纹。更早46b5预览仍在compat/preview1。两个旧兵种引擎用lieguoji-fms-play-v2（StoreKey2），推进／预览／执行均对应旧归档；未知引擎仍锁。不要修改归档。
- 新52f49仍FmsRun.version2、rules=fms-military-1，使用独立lieguoji-fms-mobilization-v1（StoreKey3）。内层schema2/.2不能决定规则。每库独立revision／CAS／主备／未来版本锁。
- 下次修改军事指纹相关文件前先封存52f49完整kernel+entry并精确注册。已有实际52f49保存，不能只改hash令其锁死，或把旧engine静默改成新值。后续显式转换另一规则仍须永久保留源世界，不能只靠第二次保存就被覆盖的backup。
- copy换runID/custom.id；v1赋步兵，v2保留原units、兵数、路线。新副本两次保存仍保留源旧库。当前空军队合法，结构预览不能再调用拒绝空军队的旧验证器。
- 5180旧v1仍147日rev1、checksum dd6050643835cc630f3cc2ae44b67b7a7be2782fed0b04361a5a6f1d84c0dd05；旧v2仍2日rev1／46b5／20军团；新库3日rev1／77军团。浏览器只导出这些元数据证据，没有完整个人存档。

## 验证与限制

- 新证据 docs/evidence/fms-army-density-v5-2026-10-05/：DELIVERY.md、checks.json、browser.json、overview.png、mobile.png。
- 本批受影响8文件83测试；旧兼容／引擎／模拟／存储／历史9文件395测试；lint/typecheck通过；37项计划／发布策略测试；实际build通过42个dist产物审计。不是完整e2e／云CI。
- 回归覆盖新旧规则派发、人口配粮守恒、跨月7日批次及新映射、驻守补员限制、空军队校验→推进→手动征募→保存恢复、旧v2副本双保存原库保护、军旗合并与拾取、明确时钟间隔。复核发现并修复了零军队新世界被验证器拒绝的问题。
- 5180浏览器实测77军团／五兵种、日更新时间3244/6221/9209ms（相邻约2.98秒）、18px盾兵点击选中、新库3日刷新同runID。5181真实构建推进39日、补员扣粮事件、39日保存刷新、play/biome Worker加载、warning/error为空。
- 生产加速观察的CDP等待在约20秒超时，随后暂停实际第39日；未假称精确30日取样。小图首月未产生新编事件，补员已观察；月度新增映射与成本以针对性测试验证。
- 428×926 Chromium无横溢出，控制条宽370，面板底742.4／时间条顶770.8，视口已恢复。不是iPhone13ProMax／iOS27 Safari/Chrome真机或用户视觉认可。
- 原五兵种／迁都／标签等证据仍在fms-watch-controls-v5-2026-10-05；历史75测试不能当成本次数量。

## 原作恢复和下一批

- 仅只读D:/steam/steamapps/common/FantasyMapSimulator及项目索引。不读认证／SDK配置／个人存档，不运行原作／恢复脚本。实际PE/IL2CPP，不是ELF/DWARF，未调用hk4e。
- 本轮复核DLL SHA256 d42658a922155f6cc60295a64c02207e5eaa1d3a55fd5ed18dc8ecc562f9b82b。月度链0x5BF120→0x5DBFE0→0x5DF980；人数0x454C40；渐进重整0x34F7D0／0x453700。具体源公式和网页适配差异见DELIVERY。原地方armyLimit、应急军、训练、重整金钱成本未恢复。
- WEB-04-06完成本次有限切片，WEB-PH04仍in_progress；下一批WEB-04-05真实海路／港口／海军。Navy.MoveToCell协程0x449600→FindProvincePath0x8019E0(allowLand=false,allowSea=true)→FindCellPathInProvinces0x7FEBB0。不能让陆军直线穿海；有限船SVG在索引，未复制，可能含Lucide来源。
- 五兵种配置／PNG和迁都小函数0x467850已接入；自动补选首都0x5D4E00触发未知。后续六政体SetPoliticalSystem0x70D250→默认属性→traits，具体数值待恢复。完整联盟／附庸、家族／信仰／继承、连续动画、长期平衡、PWA、真机与视觉仍待完成。

## 发布边界

既有私有Ethanhui6/lieguoji-web→Pages lieguoji-web原生Git，main生产／其他分支预览。旧站https://lieguoji-web.pages.dev/未更新。本批仅本地开发／构建／提交，无push、远程PR/Issue/Milestone、上传或Pages触发。pre-push、旧tasks/phaseState/programme/releasePolicy及第一体验门保持。五图标独立上游许可未逐项查清，发布锁不解除。

普通本地工程无需重复确认下一批；必要登录、权限及真机／主观验收由用户介入。会话结束后不声称后台仍在开发。
