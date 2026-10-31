# Swift 移植进度（App 仍以网页引擎运行，Swift 逐块移植、逐位对照）

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

## 已移植、待专项对照
- 参战阵营、附庸管理（贡金、独立战争）、退盟：Vassals.swift
- 军队/舰队行军记录桥接与接触重建：ForceBridge.swift

## 尚未移植（App 中由网页引擎负责）
- 新国家建立（叛乱、家族叛乱、内战共用）、家族叛乱与内战
- 外交后的部队整理：占领整理、港口归属、战争目标（war26，需海路图）、军事计时整理
- 海军：舰队、港口、远征登陆、海上交锋、舰队口粮
- 日结编排：舰队口粮、军队日结、退役、自主命令日结
- 每帧军事窗口与运行状态的接驳（类型化移植已有，需桥接）
- 新世界创建（人口与资源、人物家族、初始军队与海军、文化宗教）
- Swift 每日循环与存读档，App 切换到 Swift 引擎
