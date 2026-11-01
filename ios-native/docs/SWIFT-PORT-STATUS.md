# Swift 移植进度（0.9.5 起游戏由 Swift 引擎运行，网页引擎只生成新世界）

更新：2026-10-31

## 方法
- 数值内核（行军、交锋、齐射、占领、宣战评估、和约等）用类型化 Swift 结构移植。
- 规则编排（人物、家族、官职、外交、叛乱等）在 `JSValue.swift` 的 JS 对象模型上逐行移植：引用语义、JS 键序与网页运行状态完全同形，存档格式即网页存档。
- 每个模块由 `src/native-export/*-golden.test.ts` 从网页世界导出样本（输入链式补丁 + 网页步进后的补丁），Swift 测试逐位比对。

## 已移植并逐位对照
| 模块 | 网页源 | Swift | 黄金对照 |
|---|---|---|---|
| 日粮与人口 | war47-economy | Simulation.swift DailyEconomy | economy.json |
| 国库与国运 | native-economy settlement / destiny、destiny20-state | Monthly.swift、Persona.swift | monthly.json、destiny.json（含 347 次重抽） |
| 行军图、寻路、和平行军 | army-travel47-*、force-motion47 | Travel.swift | movement.json |
| 宣战评估 | civilization47-declaration 及 native-war 内核 | Diplomacy.swift | diplomacy.json |
| AI 军队调度 | civilization47-army-ai、army-batch47 | ArmyAI.swift | army-ai.json |
| 接触行军、齐射、占领、战力、军事窗口 | force-motion47、force-volley47、war47-occupation、upper-efficiency、force-tick47 | Combat / CombatWorld / Occupation / Efficiency / MilitaryWindow | combat / occupation / efficiency / window |
| 和平 AI、和约执行 | native-war peace / score / settlement | Peace.swift、Settlement.swift | peace.json、settlement.json |
| 地形、气候、省份、开局 | terrain、climate、settlement47-regions、civilization47 开局 | Terrain / Climate / Regions / Opening / Preview | terrain / climate / regions / opening |
| 每月征兵、伤军补员、故乡重组 | civilization47-monthly-muster、army-recovery47、civilization47-original-army | Muster.swift | muster / recovery / reorganization |
| 人物生命周期（年龄、自然死亡、君主死亡、家主与按政体继承、空位） | civilization47-lifecycle 及 native 内核 | People.swift | people.json |
| 原作家族日结（失地与灭国命运、家族军队、生育、婚姻、影响力、旁支、宣称、灭绝） | civilization47-nobility-* | Nobility.swift | nobility.json（180 天，45 次强制命运） |
| 官职（月度任命 AI、年度考核、收入与叛乱效果） | civilization47-offices | Offices.swift | offices.json |
| 家族领土重新分配 | civilization47-nobility-territory | Territory.swift | territory.json |
| 战争结算写回（领土、赔款、停战、战争记录、编年史） | civilization47-war-settlement | PeaceBridge.swift、Wars.swift | settle.json |
| 外交日程、宣战登记、联盟 AI | civilization47-diplomatic-state、-declaration、-alliance | DiplomacyBridge.swift、Alliances.swift | declare.json |
| 行省叛乱判定 | civilization47-rebellion | Rebellion.swift | rebellion.json |
| 政府延续、迁都、君主对敌战力、在位与国家特性记录 | civilization47-political-owner、-capitals、leader-history47、state-traits47 | Government.swift | government.json |
| 新世界政府段（第一部分：地貌、财政格子、省防御） | settlement25-terrain、-cells、-combat | OpeningGovernment.swift | opening-government.json（4 种地形） |
| 新世界创建（createCivilizationWorld47 全段）：省份、城市、国家，人口与粮食，首任君主与编年史，人物与生日；统治家族、主权账；开篇国龄与在位；原作贵族家族、领地与成员 | civilization47-world、statecraft initializeManagement、initialCivilizationChronicle47、life22-people、civilization47-family、-origins、-nobility、native-economy/noble-families | Creation.swift（家族成员内核与 Founding 共用） | creation.json（4 种地形 × 2 种命名，三段逐位含键序） |

## 运行编排（逐位对照）
| 模块 | 网页源 | Swift | 黄金对照 |
|---|---|---|---|
| 新国家建立、家族叛乱、内战 | civilization47-founding、-rebellion、-nobility-revolt | Founding / RebelWar / NobleRevolt | uprising.json、revolt.json |
| 每日结算 | civilization47-daily | Daily.swift | daily.json |
| 每帧军事窗口（行军、交锋、齐射、占领、战功、战损账） | force-tick47、force-accounting47、war47-occupation | RunWindow.swift | run-window.json |
| 陆军轮转军令 | civilization47-army-ai、army-commands47 | ArmyOrders.swift | army-orders.json |
| 战争目标账本、停战后部队整理 | war26-state、civilization47-war-settlement | War26.swift | day.json |
| 整天循环（军事帧、日结、政治外交） | culture47-session advance | Session.swift | day.json（90 天） |
| 玩家命令（行军、停止、宣战、议和） | culture47-orders、political-owner | Commands.swift | commands.json |
| 交接、存读档、20 天连续推进 | native-bridge nativeWorld | NativeEngine.swift | bridge-world / bridge-after |

## 尚未移植（仍由网页引擎负责）
- 新世界创建后续段（attachGovernment47：地形格与资源、开局人口、财政、首批征兵、国运；attachFoundingForces47：初始海陆编制；规则启用动作）。App 仍用网页引擎建世界后交给 Swift。
- 说明：Creation.swift 只照搬网页现行规则，未新增任何数值。其中按面积与地形的人口粮食系数（2.5/2/1.3、×0.7、×20）和开篇国龄是网页自己的规则，网页事件文本已注明"模拟参数，不代表正式设定"，并非原作核实值；开篇国龄同样是网页开篇规则。
- 港口归属账与海军（当前世界没有舰队；有港口的世界中港口账暂不更新）。
  - 2026-10-31 核查（src/native-export/harbor-golden.test.ts，EXPORT_NATIVE_WORLD=1 运行）：在原作 20k 网格上，网页 seaGraph 判定“外海”要求水面三角形的边落在地图边界（x=0、y=0、x=1600、y=900）上，但 20k 网格 19928 个点没有一个在边界上（x 0.44–1595.62，y 0.47–899.5）。因此四个创建样本（continents、pangea、highIsland、archipelago）都得到 0 片外海、0 个港口、0 个首府港湾；attachFoundingForces47 的 initialNavy 因而不建任何舰队，造船也要求港口。结论：网页新世界里海军整体不可达。逐位照搬只会得到同样的空海军，界面上看不到任何东西，所以暂不移植海军模块。
  - 待 Bob 决定：若要海军可见，需要改网页的外海判定（例如以网格外缘三角形代替严格边界相等），这会改变网页行为与现有存档，属于「与原作不一致」的取舍，不在原生端单方面修改。

## 性能
- 分段计时（Profile.swift，DayTests 输出）：缓存海域表与通行关系后，整天循环约 0.09 秒/天（CI），其中行军与接触约占 75%。

## 与原作不一致（网页适配，保持与网页逐位一致，待 Bob 决定）
依据：games/架空地图模拟器-ref/original/_ui-export/ios-newworld-people-army-port.md。Swift 照搬网页，以下差异未改动：
- 特质：原作实测 27 条（先天只有 Genius、Unifier）；网页互斥表引用的 Kind、Generous、Trusting、Content、Arbitrary 在原作中不存在。
- Nobility.traitType 按四维修正之和分档，与原作 json 的 type 不符，会分错 Merciful、BattleHardened、NavalMastery、ShipMaster、Reformer、Cruel、WarWeary、Ambitious；抽取比例 40/30/30 与每人 1–3 条原作无依据。
- 初始兵种按军队序号轮换不是原作做法（原作推断为征募权重乘生态修正）；Efficiency.swift 精锐再乘 10 原作无依据。
- 文化集与姓名规则、家族成员年龄、子女数、旁系人数、女性继承 30%、开篇国龄、人口粮食系数都是网页数值，原作中找不到。
- 待核（不编造）：开局家族数、初始军队数量与位置、港口归属、海军开局。
