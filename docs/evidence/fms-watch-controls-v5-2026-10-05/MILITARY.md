# 五类陆军、征募、迁都与地方详情

2026-10-05，本地功能源码146df66332ceeab51c652f4d881edaa10dc1c0f8；触控收起按钮修正及最终构建d4a0a80681a6218be6a2a7786222404a2931ad02。WEB-04-04的有限可玩切片，不是全战争系统或完整原作移植。

## 实际功能

- 新局每国三支真实单兵种军团：步兵、弓兵、骑兵，拆分原有初始兵数，总数不增加。玩家另可征募盾兵、精锐。
- 原作五种图标、基础战力、移动速度、山地攻防系数进入实际显示/行军/战斗。骑兵1.2倍速度、盾兵0.9倍速度；跨辖区保留当日剩余行进时间，路线预览按同一规则估计到达日期。断粮、拦截、和平、撤退仍会改变结果。
- 征募从选定的本国法理且实控城市扣当地人口，支出ceil(人数×100/6)人日粮，配发100点军粮；每次100—3000人、最多当地人口10%、保留100居民，最多30支活跃军团/国。新军士气65。即时成军是本版网页规则，非已恢复原作训练公式。
- 迁都重验目标城市法理/实控、本地交战与当前首都，成功更新首都引用、图标和定位；不搬动城市/人口/军队，不收费用。预览及Worker重验day/nextEventId，成功产生事件使同日旧确认失效。
- 地图显示原作兵种图标、国家颜色、人数及行进/撤退标记；同点军团分开排列，重叠点击仍可选择。不是每名士兵的骨骼动画；当前随模拟日更新位置，连续帧行走表现仍待优化。
- 放大显示真实乡野辖区名称；选中地方显示实际人口、人日粮、控制国/原属国、真实城市和驻军、陆地邻接。没有城市的辖区明确显示乡野，未把每块土地伪装成城市。

## 原作来源与未知

只读授权路径内的`FantasyMapSimulator_Data/StreamingAssets/Base/Military/Default/military/MilitaryProfile.json`及五个256×256 PNG。profile SHA-256为395030721678acdfcd5ce1cc6ae75872b595c2a72e1b160a8f5ad3f41657cfcf。逐项文件摘要见military-provenance.json。

安装包DLL SHA-256为d42658a922155f6cc60295a64c02207e5eaa1d3a55fd5ed18dc8ecc562f9b82b。类型/地址索引加限定机器码检查，未运行原作或恢复脚本，未把空DummyDLL当实现。

- Army.GetSpeed RVA0x34BC00消费移动系数；ApplyDisplayedSpriteIcon 0x343190消费兵种图标与国色。原作Army为单unitKey+armyCount，不是同一军团五类混编。
- RecruitmentPlanner.BuildUnitSpawnPlan 0x402EA0、PickSingleUnitKey 0x4043B0、CalculateRecruitmentWeight 0x403830、DistributeByLargestRemainder 0x4038E0已定位；本版没有声称完整恢复其征兵公式。
- ProvinceInfoUI.OnSetAsCapitalButtonClicked 0x467850完整小函数：有效非空白国家→state.capitalBurgID=province.capitalBurgID→刷新新旧城图标；本路径没有迁都费、冷却和人口阈值。网页额外的引用/归属保护是本项目合同。
- Navy.MoveToCell协程0x449600使用海路：FindProvincePath 0x8019E0(allowLand=false,allowSea=true)→FindCellPathInProvinces 0x7FEBB0。尚未接入网页，不能以陆军跨海直线或舰船装饰冒充。
- 政体有Kingdom/Empire/Federation/Republic/Tribal/Theocracy六种；SetPoliticalSystem 0x70D250→UpdatePoliticalSystemAttributes→GetDefaultForPoliticalSystem→AdjustAttributesByTraits。完整默认数值尚未恢复，网页尚无这六种真实政体效果。
- 原作结盟存在Alliance实体，ForceAlliance 0x5C7B30先停战并清理战争，CreateAlliance 0x896070还调整闲置陆海军。网页目前外交仍是宣战/讲和/停战保护；联盟/附庸未完成。

原作图标的独立上游作者/许可尚未逐项确认；来源与未知保留在public/terrain-licenses.txt及provenance。只复用限定游戏数据/图像，不包含安装包、dump、SDK/认证文件或真实存档。发布锁仍关闭。

## 兼容及实际失败修复

v1永久执行冻结0.4规则65333e9e…，不随新军事规则改变。v2用独立lieguoji-fms-play-v2库，外层version=2/rules=fms-military-1/实际源码SHA和一一对应units；World内部schema2/.2只表示复用的基础数据结构，不负责引擎派发。v1/v2各自revision/CAS、主备、摘要、未来版本锁。

新规则当前完整指纹为a3d9d4019fa04b21e9096e2a15aef442f36553d967cbed7fb486c5624077537f。它覆盖闭合核心依赖、参数/行动/创建编制及入口/转换/初始世界源码。显式复制旧局产生新run身份与v2记录，原军团标为步兵，不悄悄随机分型，不改原v1档。

本轮HMR期间保存的测试v2使用早期kernel指纹46b5a571…，刷新后正确锁写。根据实际SHA复算，精确找到当时核心字节，封存到src/fms/play/compat/preview1，并注册这个**唯一已知**旧规则；构建重验档案摘要和原始指纹。该档随后正常刷新恢复，仍按旧规则执行。没有修改存档中的fingerprint，没有接受未知规则或删除检查。

复核修复边境调动未用兵种速度、骑兵进山估值未乘山地系数两处遗漏，各有回归。初次抽出测试fixture时漏import导致失败，修正后重跑，未删断言。手机尺寸检查发现收起按钮宽35.75px，改为44px并实际复测。

## 真实证据

- 受影响7文件75测试通过；旧兼容/引擎/模拟/历史/存储9文件395测试通过。lint/typecheck通过。未把上批全量2458测试记成本批重跑。
- 最终生产构建d4a0a80通过，42项产物白名单；旧全局规则指纹不变，FMS独立新指纹如上；没有云端CI和发布。
- 开发浏览器：梁首都尤溪→卫桦；分别征募100盾兵和100精锐，各扣100人口/1667人日粮；骑兵尤溪→江油，预览2天/12补给，实际第1日行军94补给、第2日抵达88补给；保存刷新恢复首都、20个兵种映射。v1第147日revision1及checksum保持原值。
- 最终构建浏览器：淮夷零陵→安丰迁都，零陵征募100盾兵，骑兵2日抵达安丰；独立保存第2日、刷新恢复，旧版第1日入口仍在。play/biome Worker加载，控制台warning/error为空。
- 428×926 Chromium尺寸检查：scrollWidth428、面板底742.4、时间条顶770.8、收起按钮44×44。已清除临时viewport覆盖。这不是iPhone/Safari/WebKit或真实触控通过。
- 详情见military-browser.json、military-checks.json及production-armies.png。用户视觉认可、真实手机、动画细节、长期平衡仍待验。

## 未完成与接续

海军/港口/海上寻路和战斗、完整外交/政体、AI征募补充、训练装备、原作biome因子映射、混编、家族继承/信仰、城市建筑近景均未完成。下一切片按真实海洋拓扑接港口与舰队；政体恢复按原作六类属性消费者接入，不能只加名称。不要重复提取本批五种兵种配置、词库、颜色和迁都小函数。
