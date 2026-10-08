# 真实文化候选：军队速度、统一时标与逐 tick 人物日历

接续 b0a0c2f 创建的同一真实文化候选，未启用完整47/Store49/Worker/UI，旧46及5254用户世界保持。根独占源码写入，两个审查者只读。当前实现不是新可玩版本。

## 实际改变

1. 每支 Army 在创建时保存一次基础速度、初始化国家/时刻和骑兵传统输入。普通分支按已核 Init 的 float32 Range(.7,1.1)×1.5；骑兵传统分支为已核1.9499999284744263。确定性 hash 抽样是网页适配，既不是 Unity 随机流也不是骑兵兵种。当前创始国家没有启用该传统；真实文化不推导军事传统。读取/换格/JSON恢复不会重抽，后续征募/重整仍须明确调用初始化生命周期。
2. Army 从统一账本给出的实际 cell 取山地/高原/海陆，海上忽略陆地兵种倍率；Fleet使用已核float32(2.2)。不读取旧Army.provinceId、Fleet.node、目标城市或屏幕相机决定速度。
3. `forceClock.secondsPerTick = life.secondsPerDay / 120` 保存为 double。移动只乘一次该系数，首次攻击期限为2/secondsPerTick，后续float32(2×Range(1,3))/secondsPerTick，保留小数期限。去掉尚未启用47原先独立10ticks/秒与人物日历之间120倍的差异；旧46时标不变。旧军事核测试以显式synthetic .1秒/tick保留20tick场景，真实创建不能使用这个假时标。
4. `advanceCivilizationMilitary47` 固定速度回调和每个整数tick的人物推进，不在帧/分数攻击时刻重复推进人物。日界先完成军事事件，人物日期同步到该tick，`world.day`仍留在未结算的一日，返回private dailyPending；未日结不得继续或存档。没有运行旧advanceLife22，没有让创建回执验证器接纳已运行世界。
5. 所有活亲属月龄同步，包括未在朝者；月界revision溢出、缺失出生记录、旧家谱格式、首月伪造创始年龄和无出生来源的新生生日都会拒绝。失败丢弃整个深拷贝候选。

## 原作依据和明确的网页差异

- [Army Init/时标静态补证](../fms-army47-commands-2026-10-08/NATIVE_SPEED.md)：普通实例随机与国家传统分支、默认日长及时间关系。没有再次运行原作或分析脚本。
- [Navy恢复](../fms-naval-v5-2026-10-05/DELIVERY.md)：固定速度2.2。
- [原时钟恢复](../fms-continuous-motion-v5-2026-10-05/ORIGINAL_CLOCK.md)：缩放时间推进与默认日长。
- Unity世界长度至网页1000单位世界**尚未标定**。本批单独保存`mapUnitsPerNativeUnit=1`，把原速度数值解释为归一网页单位；不用绘图文档scale冒充原作尺度。当前该合同固定为1，加载时不能随镜头/地图尺寸重新估计。
- 普通biome速度表尚未闭合，明确`neutral-unrecovered-v1`；山地/高原与兵种已核系数可用。未拿战斗地貌倍率充当速度倍率。
- 以当前float32(.1)秒/日计算，Navy约0.22网页单位/日，首攻约20日，距离100无阻挡约455日。这个换算不是原作观感已达标，也不是用户900天孤岛登陆问题已解决；需要完整AI与地图长度对照再调，不能隐藏加速。
- 战斗人物/官职/突出部/伤害快照输入仍由显式调用方提供；本批测试使用命名明确的combat fixture，不把其1/0参数称为恢复完成。下一步接真实战力输入和完整日结。

## 验证范围

新回归包含：真实创建速度保存；海陆/山地/高原当前格换速；与文档scale无关；真实在途Army一次/分段/JSON续算；原时标首期限跨20个军事日窗；日界之前/同刻/之后攻击；日结待办拒绝重复tick；非在朝亲属月界；晚失败回滚和损坏拒绝。

跨20日测试的日结是明确stub，只增加world.day以继续独立军事阶段；没有执行财政、AI、造船、出生死亡，也不是Store49/IndexedDB或900天游戏验收。速度Fleet标量测试使用独立真实海面探针，不假定每张测试图必有合格初始港湾。首轮正因错误假设存在初始舰队而失败，日志保留。

类型/lint/相关单测/发布保护/构建的真实状态以checks.json为准。当前产物仍46，新47未被生产入口导入；构建不能证明新47可玩。真机、用户视觉、完整原作等价、900天登陆、宗教/暴政/家族分裂与地图材质仍未通过。不push/Pages/main，不刷新5254，不写旧档。

## 下一批已核代码入口，避免重新扫描

旧链实际在`war46-runtime.ts::advanceWar46Tick`与`war46-core.ts::settleDay`，不是不存在的war46-tick文件。沿已核顺序拆接：海军实际停港补粮→world.day增加→47居民/Army日粮→断粮后果→月税→AI→常备/紧急征募→国运。`war47-economy::createArmyEconomy47`已经使用实际Army位置并包含居民人口结算，不能再次调用初始化人口公式。财政纯核/courtIncome可直接复用，旧restoration19包装的nationEthnic须换economicEthnic47，军费使用实际陆省/海面而非旧route/provinceId。`settleDestinyMonth`只需已有world/upperCombat/people/finance/tactics窄输入，无须旧culture或完整旧LifeState。

最小新适配为47私有日结owner、月税军费包装、月度征募包装。新增军队同时登记位置/速度/上层基础值；和平遣散不能将47在途idle误作驻军。海军`advanceNavy(false)`仍按旧dockId补给，不能直接复用；须以fleetPositions确认实际停港。独立跨海Army已在47日粮扣粮，不能再按运输载军重复扣款。人物在本批已推进，日结不要再调旧advanceLife22。这些是只读代码索引，尚非已实现日结。
