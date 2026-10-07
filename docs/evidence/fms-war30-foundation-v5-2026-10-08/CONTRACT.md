# 外交水域与新版本存档基础

2026-10-08，WEB-04-37，源码 c7c51544113032653c13b71ef0f26cd15263bf99。原任务继续；全项目审查/前10差距仍排队。

## 实际实现

当前陆地辖区不是原作完整Voronoi省图；它们由 settlement25 的真实 h20 剪裁地形面连通合并而来。旧数据只有海面三角形、航路和外海港口，没有持久水域省份。本批新增 wet-face-area-unions-v1：用正长度水面共边合并真实湿面，目标平均面积由既有陆地辖区面积确定。分区数量为 min(湿面数,max(水体分量数,ceil(总水面积/平均陆省面积)))。面积、中心、实际面成员、所有共边水邻与海岸陆邻一并保存；湖泊也保留。

- 土地、城市、地形、旧战争编号和存档不重新划分。水省ID放在全部陆省之后，仍不插入 World.provinces 或 nativeWars.provinceIds。
- 岸线按实际地形的 h20 剪裁核验；同一面归属唯一，分区必须连通，不能跨零宽接触或 h20 细脊。岛洞、内湖以面成员表示，不用凸包填平。
- 旧辖区若无法与真实岸线精确对应，新版复制明确失败，原局继续原规则；不就近猜城市，也不静默缺少海邻。
- 国家占领变化只重建查询对象的当前owner；不改变已经保存的分区。地图或陆省身份变动拒绝复用；读档验证，不运行分区器偷偷迁移。
- 外交海邻使用已恢复原函数四层水省搜索，见[原函数边界](../fms-casus-state-v5-2026-10-08/RECOVERY.md)。水省生成器是明确的网页适配，**没有原作水域生成器/同海距等价证据**。海邻资格不等于船能到达；实际港口和航路仍由原海军执行器验证。

## 版本与保存

v29的12个实际执行源按原指纹冻结；其内容未改。新候选version30/rules fms-war-30，Store32/lieguoji-fms-war-v30；只接受明确副本，不覆盖Store31。保持主备槽、SHA256、完整槽CAS、事务提交/中止及未来字段锁。新候选自身、备份或主槽中的未来地理字段均锁读写；已知值损坏可恢复有效备份。候选仍没有国家AI状态、完整CB账、War30Session、Worker或UI，所以**不是新的可玩交付，也不是原作战争完整接入**。继续在此候选接完，不为下一切片另建版本。

## 实际检查与边界

39项相关检查全过，31新增；全仓types/lint、39计划/发布保护、构建43白名单通过。[逐项报告](checks.json)与[单元结果](unit-final.json)。首次指纹检查超时、Python环境缺模块、浏览器测试初始化漏调用、Vite重启连接重置均保留。修复重复指纹计算和测试脚本；未删除断言或放宽游戏性能要求。

真实隔离Chromium开发服务器：v29 Worker建双岛合成世界→明确生成v30候选→分别保存→刷新后全内容摘要完全相同→竞争保存只有一次成功；v29正常界面仍能进入、推进一天并保存。新建浏览器上下文，未读取用户个人origin存档。截图[桌面](retained-v29-desktop.png)/[428×926仿真](retained-v29-portrait.png)是保留的v29界面，测试用双矩形岛不是新美术或原作视觉对照。无页面错误、无横向溢出。[浏览器报告](browser.json)。

实际默认36864点/72962三角形，60陆省→100水省、45915湿面，JSON约293537字节；单次地理生成约680ms、完整校验约175ms，Chromium153本机开发环境。前置陆省生成约735ms。无多次分布、手机/GPU/FPS结论；不能每tick重复此完整地理校验，生产接入应在Worker初始化/加载/保存验证中执行，后续如需缓存须证明不漏数据变更。

## 待接续

Continue the existing unpublished v30 candidate, not another version: persist actual country/relationship and full CB goal state; wire native declaration scheduling, real war/settlement outcomes, then Worker/UI. Reuse frozen v29 runtime and voyage execution with old autonomous declaration disabled. Finish WEB-04-37, then WEB-03-06 and queued full audit. Do not regenerate sea partition on load or treat water faces as native water provinces.

仍缺外交国家/关系历史输入、原作完整trait与宗教/联盟/附庸生命周期、宣战记录与真实结算、生产Worker/UI和新版本浏览器闭环。此次不改变任务完成状态，不启动排队的地图重构。无push/Pages/main/正式站变更；真机、用户视觉与完整原作等价仍待验。
