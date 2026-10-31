# Swift 移植进度（App 仍以网页引擎运行，Swift 逐块移植、逐位对照）

更新：2026-10-31

| 模块 | 网页源 | Swift | 黄金对照 |
|---|---|---|---|
| 日粮与人口 | war47-economy | Simulation.swift DailyEconomy | economy.json 60 天 |
| 国库与国运 | native-economy settlement / destiny | Monthly.swift | monthly.json 12 个月 × 8 国 |
| 行军图、寻路、和平行军 | army-travel47-*、force-motion47 | Travel.swift | movement.json 720 帧 |
| 宣战（外交日历、好感、宣战理由、目标、参战方） | civilization47-declaration 及 native-war 内核 | Diplomacy.swift | diplomacy.json 552 次评估、70 次宣战 |
| AI 军队调度 | civilization47-army-ai、army-batch47、army-commands47 | ArmyAI.swift | army-ai.json 1302 批 |
| 带接触的同步行军（遇敌停下） | force-motion47 advanceForceContactsCore47、force-runtime47 | Combat.swift ContactMotion、CombatWorld.advanceMotion | combat.json 50 帧 |
| 齐射、阵亡、故乡重组 | force-volley47、force-losses47 | Combat.swift Volley、CombatWorld.volley | combat.json 50 次齐射 |
| 围城、空城接管、易手 | war47-occupation | Occupation.swift | occupation.json 110 次、46 次易手 |

## 尚未移植（App 中由网页引擎负责）
- 攻击计时（force-clock47）与军事窗口编排（force-tick47：每帧 占领 → 计时 → 齐射 → 行军事件）
- 战力（nativeUpperEfficiency：君主、官职、国运、政体、财政、核心防御、地形、港口封锁）
- 议和与战争分数（advancePeace47 / settleWar47）、同盟、附庸
- 每月征兵、退役与恢复、重组进度、海军与登陆
- 人物与家族（年龄、继承、婚姻、官职、贵族）、叛乱与内战、文化与宗教
- 地图生成（recovered terrain、settlement、文化开局）
