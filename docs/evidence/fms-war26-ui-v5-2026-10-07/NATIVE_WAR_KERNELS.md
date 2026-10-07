# 原作战争分与厌战纯函数、和约续接证据

2026-10-07；父 HEAD cfc847c。根唯一写入，已有代理只读复核。来源为用户授权的 Windows IL2CPP GameAssembly.dll，SHA-256 `d42658a922155f6cc60295a64c02207e5eaa1d3a55fd5ed18dc8ecc562f9b82b`。未运行原作、未读取凭证或个人存档。原始 dump 不提交。

## 本批接线范围

`src/fms/play/native-war/score.ts` 和 `weariness.ts` 是独立、带查询端口的恢复内核，**尚未导入生产模拟、旧规则指纹或游戏面板**。v26 战争分、伤亡账、厌战、自动议和没有因这些文件而完成；没有创建 v27 或改写旧局。

分数/目标进度原函数、查询次序及方法哈希沿用 [NEXT_WAR_RECOVERY](../fms-war26-v5-2026-10-07/NEXT_WAR_RECOVERY.md) 第2节，不重复拆解。保留 float32 运算、int32 加减、列表重复项、固定 Defender 敌方集合、第三方夺省可计目标达成、当前查询两次等原语义。输入为已合法化的原 int32/float32 值和有效枚举；任意损坏数据、NaN 或未量化 double 不属于数值等价合同。

## 厌战恢复合同

`WarWeariness(null)=0`。非空先查 SideOf，再 ResolveState，即使 Side=None 仍查国家，然后 None/国家空返回0。国家 isDead 不在此处过滤。

1. 伤亡：自己的死亡数 DS、敌方 DE，total=f(DE+DS)。total<=0 返回0；否则 f(clamp(f(f(f(DS/total)-.5)*3))*clamp(f(total/2000)))。死亡数由当前参战列表后接已销毁列表逐项 f32 累加，不去重。
2. 实力：仅当前参战者累加查询端口 GetStrength，空国家跳过，不过滤 dead。total<=0→0，否则 difference=f(.5-f(own/total))，clamp(f(difference+difference))。
3. 财政：income/expense/gold 来自国家 int 字段转换为 f32。income>0 时 burn=clamp(f(f(expense-income)/income))，否则 expense>0→1，否则0。treasury=clamp(f(1-f(gold/f(max(1,income)*6))))。**max 在乘6之前**；最终 clamp(f(treasury*.5+burn*.5))，各乘法先 f。
4. 领土满意：本人从敌国得到省数减去本人被敌国夺去省数，再 clamp(f(f(net)/3))。敌国集合来自当前+销毁参战者的另一侧，排除 None。初始所有权快照逐项先查询当前 isLand，再重新查询 owner；中立和同阵营其他国家不是本人收益。
5. 基础小计按 f32 顺序：casualty*.35 + strength*.25，再加 territory*.25；然后 economy*.15 加此前小计。战争任意目标类型 Annex=3/Vassalize=4/EnforceReligion=11 时乘 .6；不按目标所属方、主目标或完成状态过滤。
6. 首都：使用 InitialCapitalByState 快照，而非当前首都；其当前 owner 与本人属于不同且均非 None 的当前参战侧时加 f(.15)。不查持有时长；已销毁参战者不参与 SideOf。
7. 时间：端口返回从 StartTime 起完整历月，floor=clamp(f(f(int32(months-60))/60))。最终 clamp(max(floor,f(capital+base)))。**没有用网页 day/30 假冒原历月**。
8. Distress 为另一公式 clamp(f(economy*.2 + f(strength*.35 + casualty*.45)))，各乘法 f32；不含领土、首都或时间项。
9. EffectiveForceSettleThreshold 取主攻、主守厌战较大值，f(f(clamp(max)*-35)+75)。ShouldForceSettle 先算战争分，再阈值，abs(score)>=threshold，包含等号。null 得分0/阈值75，结果 false，无查询。

`SideOf` 只取当前列表第一个匹配。`GainedProvinces` 计数 int32。时间函数原 `TimeManager.GetMonthSince` 使用 double StartTime、当前 float gameTime 转 double 后的日期，Noda 月差；后续可复用已有 `native-economy/character-calendar.ts` 的日历查询端口。

只读二审特别核对了储备分母的 max 位置、null 强制和约、None 的查询次序及 f32 合并顺序；没有发现实现偏差。实际测试结果另见 DELIVERY，不能把静态核对当原程序联调。

| 方法 | RVA / 字节数 | SHA-256 |
|---|---|---|
| WarWeariness | 68E580 / 768 | 63b1b73d98bedf3c05f6e3a1f78d37c80c63497ed27b30dec3ac93ab6ba2447c |
| ShouldForceSettle | 68D690 / 176 | a7b1e6e762db2e50a2bc62c51cdb2e83ec720038a38ec96ed22c9968e4f6a762 |
| EffectiveForceSettleThreshold | 68CCB0 / 128 | 90c3f904deb386223d607c2b374a9f8c041417ceae8766ebd6625615859d5e30 |
| CapitalHeldPressure | 68C7F0 / 272 | 691dc6905d21be832dc1a354dc1c395a5eec4cecae82267f922cfb29296a302a |
| HasDecisiveIntent | 68D270 / 304 | 25c9f089c8d1b0fe177b02641e65de373b50bf4a78678de9c550362fa05e7790 |
| Distress | 68CB00 / 224 | 67a534fcfb8c846cfe963530e0d290c534caebc862af22af1cdd320b600e6682 |
| CasualtyStress | 68C900 / 192 | fc4a72fdd3c327bdeb33a1eb957c00c64716c518048313b19b9b057e63a462fc |
| StrengthStress | 68E2D0 / 144 | dc14f613aa05f82239f080f9a57117f688457c234321e57e4cf953499bd1a8d9 |
| EconomyStress | 68CBE0 / 208 | 3b099361ab475ecb4952777f735a4adbbb5e3956c25b935981b73dc439a5e4d7 |
| TerritorySatisfaction | 68E540 / 64 | ee8cf154d5924259bfcc106fcf1c4952a6c73b30be2b14da605ba1f3033a2fbb |
| WearinessTimeFloor | 68EEB0 / 160 | 11ae2742358cd99c5c6a2425d968e9a7caf57f3b5a715e11258199e4e7493c46 |
| GainedProvinces | 68CD80 / 1168 | 065c066c72dae156e61dfd79fc4313896a8e0357c2c7c23a2929434cf4a92ecf |
| SideDeaths | 68D740 / 608 | 4f8a3fa9dcdc282560685cf77ea60c9fbd79f3ab5969938f0bf8d28dfd050047 |
| SideStrength | 68DEB0 / 1056 | cc311eeb4ff37e1b541968a9afd6ddeba7adecc26c04a914f611115edfee26fc |
| SideOf | 692780 / 240 | a7ff09d5c0b8aa93e9cf091a778d08c8937ee485e6a10aeacb10face69752aad |
| GetMonthSince | 5235E0 / 160 | 8fee95c5dcdcb604af5b4faf009fba7d179d8df5eb5a4311174a10024b3cc811 |

## PeaceResolverV2 只读恢复，尚未编写生产实现

实际类名为 PeaceResolverV2。以下不是完整和约系统等价；Apply、ConqueredBy、最终分类依赖必须继续核实。

- BuildSettlementPlan：war空或 reason为6/7/8/10/11（旧清理、无效清理、强制清理、起义升级、手动停战）→null。FatigueTimeout=4、NominalPeace=5正常构建；**名义和平不是强制空计划**。内战单独调用 BuildInternalSettlementPlan。
- IsAnnexation 初始为 AnnexationConquerorId>=0，仅使用正负，不将该ID作为全部条款受益国。DetermineVictorSide 可null；决定性吞并须 ShouldDecisiveAnnex 且 reason!=FatigueTimeout。
- 对可执行目标类型0..4/6..11：已达成直接有资格，不要求受益方为胜方；未达成只有 CedeProvince/CedeArea/Vassalize/WarReparations/EnforceReligion 可凭受益方属于判定胜方强制执行。Liberate=5排除。
- 非领土效果仅附庸、赔款、强制宗教；IsAnnexation 时不添加这些效果。其余合格目标记录ID并 CollectTransfers。决定性吞并补主防国→主攻国，先有条款优先。
- ResolveGoalProvinces：Annex读目标国当前非空陆省列表；其余直接 TargetScope.ProvinceIds，null scope异常/null IDs空表，不重新按区划搜索。
- CollectTransfers：按省ID去重，首条优先；省存在/陆地/当前非受益国、且owner在固定defender集合；OccupyCount=2明确跳过。非吞并还查当前该国陆省数>1，**不扣已排队转让，不能保证最终留一省**。此层不要求当前已由受益国占领。
- CollectAnnexationTransfers：败国列表先ToList，非空陆省且尚无条款，SourceGoalId=-1、SourceGoalType=Annex；不逐项重验列表中的owner。
- 构建后 ClassifyOutcomes(includePendingTransfers=true,useActualEffects=false)。执行不能把构建期结果当最终结果。
- ExecutePlan：plan空直接返回；先清 AppliedProvinceTransfers，进入 CapitalFallService 抑制计数 try/finally。每条查省和目标国，缺失跳过；调用 Province.ConqueredBy(target,true,true)，再核实真实省owner==目标国，成功才记Applied与动画。此层不重验 FromStateId/陆地/剩余省数。finally 抑制深度减一且不低于0。
- 非空白可征服战争才播放成功的征服动画。逐个 effect.Apply；返回null记失败；Applied/AlreadySatisfied才成功，否则移除其EnforcedWarGoalIds。效果失败不回滚已成功转地；转地失败此层不移除目标ID。
- 重新按实际转地/效果 ClassifyOutcomes(useActualEffects=true,includePendingTransfers=false)。内战使用独立分类；特定内战类型5/8..11，母国实际胜利时可尝试镇压国运。非空白战争对存在且未死亡国家记录未记录过的结局。
- DetermineVictorSide：先双方死亡/零列表或 HasStateCollapsed；单方崩溃另一方胜，双方崩溃null；GoalsAchieved/CapitalFallAnnexation→Attacker。其后一方distress>=.45且比另一方多>=.25则该方败；否则score>=50攻胜、<=-50守胜。FatigueTimeout下领土分量*100>=10且goal>0→攻胜；<=-10或<=0且攻distress比守多>=.1→守胜；其余null。float32减乘不得合并。
- ShouldDecisiveAnnex：胜方必须攻方，双方对象存在，守方活且陆省>=1。任何Annex目标时，按初始守省且目前仍陆地的数量作基数；攻侧持有初始守都则当前守陆省<=initial*.7，否则<=initial*.4，initial须>0；否则仅守陆省<=1且攻实力>=守*3时真。FatigueTimeout禁止新触发此分支，但不抹原AnnexationConquerorId标志。

| 方法 | RVA / 字节数 | SHA-256 |
|---|---|---|
| BuildSettlementPlan | 66C970 / 1984 | 08665d43a08ca1aed050ab27eb3f4acfb170879a402acffad25f64da0c817527 |
| CollectTransfers | 66E510 / 864 | dce7feb13513e73905de2b0c62523b8c4b6f3fce871e072240c65902d94ddc0a |
| ExecutePlan | 66EEF0 / 4128 | 2478339c5e497cfcb5b16f314087adae07b795db722a3e45aa6922a4ce9f56b4 |
| DetermineVictorSide | 66EA60 / 1168 | 3e9691816eb377b679d76ee2c79ece638243791b28679dd8cc05362cfd08385c |
| ResolveGoalProvinces | 671340 / 784 | 26867432f4d2662ed5f8b82baa32a865b29e024b8b4fbdacf05870c7cfbcf475 |
| ShouldDecisiveAnnex | 6716E0 / 848 | 30193809d3ec8d54b74f98a560b040c8accb2a785ea128c0cd1aa076df398c13 |
| CollectAnnexationTransfers | 66E300 / 528 | a34d25cc4c34ae5cde86fde0a3c83a2b5a06b6dc7a810524a92a746660e20366 |
| HasAnnexIntent | 66FF10 / 304 | a09b663512f8511b636876c0a0238475117860b705b40af1844088d53a730d54 |
| BuildInternalSettlementPlan | 66C750 / 544 | 18f4ac1ac17c5eb127464c07f3fe5e26f1c3975f98f33403cdc64e616f3b4444 |
| BuildEffect | 66C530 / 224 | 8c7771c8c89b452b1e8b279a009660be7373232c605fc370300e81cb5f7b23d4 |

后续精确入口：ClassifyOutcomes 66D440/ClassifyState 66DF50、内战分类66D130/66DD70、SideIds671A30、目标达成681990/681820、ConqueredBy4511D0、三种效果Apply；自动期限 WarManagerV2.CheckMaximumDurationWars683E30、EndWar6848F0。本链未找到统一归还非目标占领地的循环，不能推断别层没有。上述三主入口无月份检查或自动结束触发。

## 下一批生产接入约束

必须先冻结 v26 全15文件及 native-round.ts，保持原 engine；独立 v27 model/session/worker/client/stores/validator及Store29，不复制新统计进旧库。worker增量与客户端合并强制包含完整统计。实际损失在扣除处入账，不能整tick差分；伤亡因补员、载军、撤退、起义清军和断粮不同而须区分。战役记录裁剪与统计引用一致。

旧 v26 进行中战争复制后的历史只可标“本次复制以前的战损未知”，observedFromTick为复制tick；保存旧目标、sinceDay、initialOwners，不能重抽。复制后0只表示尚无新记录，不能显示整场零伤亡。旧已结束战争为未记录。开战快照、真实攻击方、击杀登记单位、DestroyedParticipants迁移和自动终战仍待核实/接线。
