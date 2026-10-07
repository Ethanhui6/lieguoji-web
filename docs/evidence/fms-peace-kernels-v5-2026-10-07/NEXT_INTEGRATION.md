# 原作战争伤亡、快照与终战清理续接

2026-10-07，只读代理检查授权 GameAssembly.dll，SHA-256 `d42658a922155f6cc60295a64c02207e5eaa1d3a55fd5ed18dc8ecc562f9b82b`。这些是静态合同和方法哈希，**尚未新增对应伤亡/快照/清理生产实现**。不重复拆解，不以当前 v27 的显示兵员账替代。

## 原始伤亡单位

Army.armyCount(+80)和damageToArmy(+94)均为float；isElite(+75)。AddDamageToEnemyArmyInProvince(342DF0)由 Attacking(343700)、BattleInProvince(344100)、BattleInSeaProvince(344B70)调用。

令 f 为每步float32、N为敌军列表Count：`base=f(f(f(combatEfficiency*damageToArmy)*max(1,damageMultiplier))/N)`；精锐目标 amount=f(base*.1)，其他amount=base。先执行敌armyCount=f(old-amount)，**不按剩余人数clamp**，然后登记同一个amount。可以超杀。若Campaign有旧War，先更新旧War；再调用WarV2的明确warId重载或两国重载。攻击军功使用base*N，未逐个应用精锐减伤，不能代替逐目标击杀账。

- 两国重载：正amount才继续；从activeWarIds原顺序选第一个双方当前Side均非None且相反的战争，不广播。
- 明确warId：正amount、该war仍活动且存在、双方当前Side均有效且相反才登记；失败无其他战争回退。
- 登记顺序kills[killer]=f(old+amount)，再deaths[victim]=f(old+amount)，缺键0。WarV2.RecordKillDeath自身只有正amount和加账，管理器入口承担活动/敌对校验。
- SideOf只看当前Participants；转入DestroyedParticipants后不再是此登记入口的当前参战国。
- 军队面板显示 trunc(f(armyCount*armyCountDisplayFactor))。
- 史书 DisplayCasualties显示 roundToEvenInt(f(f(deaths*armyCountDisplayFactor)*armyEliminatedFactor))。静态默认倍率10f和.3f，不代表用户当前设置。保留两次f32乘法，不能合并double×3或逐次先取整。

因此存在原始军力伤害、面板兵力、史书伤亡三种单位。v27整数实际扣减已经丢失小数、超杀和逐攻击来源，简单除10不能恢复。本次BattleInSeaProvince是Army路径，不能推断网页crew/hull/沉船载军可记入该账。

## 初始快照与覆亡参与者

StartWar先构造各空容器，conquerorId=-1，写ID/主国/CB和当前float gameTime提升double后的StartTime，Goals直接接InitialGoals。内战独立建参战表；外战共用去重集合先攻后守。装入完整Participants并验证两主国侧别后，**先CaptureInitialSnapshot，再nextWarId++/注册wars/activeWarIds，最后ApplyWarStarted**。

CaptureInitialSnapshot逐初始参战者原顺序：国家无效/空、provinces为null则跳过，不过滤dead。initialProvinceCounts为列表Count，含海/null/重复项。原字段准确名InitialCapitalProvinceByState(+68)：capitalBurgID>0且在burg列表范围内才取burg.cell对应CellData.Province，不检查陆地/所有权，不回退第一省。遍历非null省，initialOwners[province.id]=参与国ID，**不是province.stateID**，不筛陆地，也不遍历非参战者；重复ID后写覆盖。函数不Clear，新战争的字典初始为空。

LoadSaveData清旧集合后接收非空且Id>0战争；缺失字典补空，已有容器保留。没有调用CaptureInitialSnapshot，不能用当前版图回填历史。当前直接调用核查只定位StartWar的687E2E，未宣称排除所有间接调用。

HandleStateDestroyed先复制activeWarIds；死国仍为当前参战者才处理。先解除战争官职、在迁移前按原条件设置AnnexationConquerorId；找到当前第一个参与对象，Destroyed中无此ID则加入**同对象**；从当前列表删除所有相同ID。然后检查是否仍有双方参战国，进入终战。旧快照和kills/deaths保留。LeaveAllWars非主国直接退出当前表，不进入Destroyed；主国退出走终战。

RecordDestroyedStateLosses里的Losses是**败场数**：非blank活动战争且死国还在当前参战表时RecordWarOutcome(Defeat)，只增加败场统计，不写伤亡。State.DestroyState在5C37D5先调用它，5C4288再通知覆亡，经NotifyStateDestroyed(68FD80)迁移；null死国返回，null征服者转-1。

## 终战清理的准确归属和顺序

0x682930属于 **WarLifecycleEffectServiceV2.ApplyWarEnded**，不是WarManagerV2。同函数不执行领土条款，也不删除wars字典。

1. war空返回；当前+Destroyed按ID去重解除战争官职，国家存在即调用，即使dead。原因字符串 `war_ended_{reason}`。
2. 当前float gameTime提升double。遍历当前Participants：内战且rebelWarV2==当前ID则置-1，即使dead；先按侧收集攻守国家，再对存活国记录lastwartime、FilterBorderEnemyProvince并加入live。
3. 攻守列表交叉组合UpdateRelationOnWarEnd，不去重/不额外滤dead：relation.warCount int32++、timeStampLastWar写时间。不直接更改好感、联盟、附庸或停战协议。
4. NavalSystem.HandleWarEnded(live)，再逐live RedeployIdleNavy。
5. blank返回；理由6/7/8/10返回。其余理由若!=11则RecordWarEnded，然后PlayPeaceAnimationFor(live)。ManualCeasefire=11跳史书但仍播放和平动画。

HandleWarEnded仅收live有效国家ID>0。遍历港口：占领国/陆地主国均>0且不同、至少一个参与本次和平、双方存在；若管理器仍报告两国其他战争，则不解除港口占领。否则恢复占领者为陆地主国、占领值置navalPortMaxOccupationValue、通知；有改动且调试标签开启则重设label同步时间。不能“一场战争结束就释放双方所有港口”。

RedeployIdleNavy若国家仍有任意战争或舰队为空返回；非Unity-null且状态0的舰队调用ResetIdlePortAssignment。该重置内部和FilterBorderEnemyProvince、官职DismissAssignment内部、和平动画资源/时长未展开。

## 本批新增方法证据

均为 RVA / 索引跨度（含对齐） / SHA-256。既有Build/Execute/Verdict等哈希见此前NATIVE_WAR_KERNELS，本表不重复。

| 方法 | RVA / B | SHA-256 |
|---|---|---|
| ClassifyOutcomes | 66D440 / 2352 | 06c2e515c9e382270c7c866c858034b036185af48b6e30e0a2beecbfa3388907 |
| ClassifyState | 66DF50 / 944 | 8da6852893f81caeb24e4e71b86258706416a9db390c40ff98e3b1e98d1bb525 |
| NetGain | 670C90 / 1168 | 4941ed73936213c340fe5210a271e975b1a7b54807ee17f377d31649526c47dc |
| LossFraction | 670B50 / 320 | 64db0de7894d5aad50ee394f2d2c07b12a0e523ecd5b413050f96862d0592c6e |
| AttackerEnforceableGoalsAllFailed | 66C300 / 368 | d29e34d52c07ecc618bf02a6cb9ad741cac352938f4fb8c347486025114bea47 |
| IsBeneficiary | 670320 / 256 | 545c8453aeea54b5a34daad3b65f9bbec3fc8e68199254536fb994478650925b |
| HasEffectForBeneficiary | 670040 / 224 | 3b1981c75741ad7de408d2044eb18314b933abc46d1c2512140cff5ad31c683c |
| ParticipantsForSettlement | 692B20 / 64 | 87582cf5daa70e02d40dfcc12b4209e065ac7a59ff27dbad45f93c114f99e77e |
| SideIds | 671A30 / 560 | da66490732494f2459eda6707b85fc70efa47c8f380a5e5024e62be782d4ce96 |
| DecideInternalPeaceReason | 674A60 / 224 | 131ef80bb19b4fe2af4ef4b80352cead5f5e539b370616c9b59c1a4e591e72f8 |
| AllInternalGoalsAchieved | 674480 / 384 | 5812c3b186bb56a2b4d76ee2c9bf78f8bff9a15b5d4a32d8cc73ce3dd641c0e9 |
| ApplyWarEnded | 682930 / 2464 | b74b180d92488ae0004b8df55e6bc4ebf8a2ff08abf719857bf2e74098c9696a |
| NavalSystem.HandleWarEnded | 418550 / 1408 | c8d7e0e3cf0dcf1b31a1e7baad9656b58ca6a9174ee195cb47d5f6226658222c |
| RedeployIdleNavy | 5D5DC0 / 368 | f385bb513a8af51f729dc405d65384c47f6390d8f179f031d86b0aba5d12ccae |
| UpdateRelationOnWarEnd | 897E20 / 160 | 525f2cc1b0078682db6f045355e7a8fe5aed77a6e4ce0d976abf0e405d471f3b |
| AddDamageToEnemyArmyInProvince | 342DF0 / 928 | 1a56e8b0a5b1b2c72a5acad9c7d682346c63be991471a7f1611b1b7aaadddc9c |
| Army.Attacking | 343700 / 2320 | c5abae07bf186335366def153bdae879e6a469cea94f59ad3bf836bf830dba0f |
| Army.BattleInProvince | 344100 / 2672 | e28b660a073200887a9efb20004791d7523b1661456d59b259a01c16453f82cb |
| Army.BattleInSeaProvince | 344B70 / 416 | a5312f832bb8b6286ae62ce70be17143f0ccdfc1e2a7b4b4050175803d62e9db |
| RecordBattleKill two states | 6872E0 / 464 | 56e6cb427519942e33fe570cfa36eaa98cc362b1743bc5681fe408017bd18af2 |
| RecordBattleKill warId | 687130 / 432 | 57aa073fa138d258be59b4320f49c80a3d87e1561c9d1bf3e8c6e68f590b1a80 |
| GetActiveWarBetweenParticipants | 6853D0 / 400 | a9c009851550153f8382109d981633a6f837ced90554beb12ecaf13396294883 |
| WarV2.RecordKillDeath | 692680 / 256 | 131c7cfbd6026ba9b4bff6bb5573de48ecb80bb0b6689367c5fd51c72f8346b8 |
| Army.BuildArmySizeRow | 344D10 / 240 | 1dc4009cc235774883ab8aced6e8169e3441d6676db39af66089a7c5b5cb45f3 |
| DisplayCasualties | 681E10 / 192 | 7c14a8032a991c306ff58fd26f64600aa9b2b3d59aa759cdf9550e7705051449 |
| WorldSettings..cctor | 6E2240 / 1552 | 6001d810782ae1857b0dde90c76230e45ac90f9a3530ba17cce9e3b63ad5874d |
| RoundToEven helper | 37AC80 / 256 | c07da721ac06e319f5e8ccc652c6bbc129044106e2e292214622a7977a44affa |
| StartWar | 687880 / 3856 | c897fc0f9ae7a13db0b4057a1cd9f2d1d586bf362e4fa852a590232b6d8af426 |
| CaptureInitialSnapshot | 683AE0 / 848 | ef668b59f90115466ee1c1ae80baef42695e54176c797f128fed5e91cc0b5df4 |
| State.GetCapitalProvinceID | 5CA6E0 / 208 | d9e7fb390d9ca169c32cbe518598ff1074a900c62b828f6ee0ceaac4b355d39b |
| WarV2..ctor | 692870 / 688 | 875af5bb35529c89a4fc96dfd47bef910d95f4c8627a335864c1c4e762c19884 |
| LoadSaveData | 686AF0 / 1600 | c46ddc05c328803dedafe68107772e2bc474c2cf5a9b8abb5a76972c6e4f777d |
| HandleStateDestroyed | 685A50 / 2368 | ae0c4878b98751b42a666c22e2ed5f0edbd09a42b6407132d0aec1e8e210fc0e |
| LeaveAllWars | 686540 / 1456 | 568eb238209cfb00e20569a5aff63d2b08ff4347f4ef87722ba954b424f532d7 |
| RecordDestroyedStateLosses | 6874B0 / 640 | 0f223b965b9a93c438f46ff88d680de82f6a3a4d5ba24b97c371107c85abf432 |
| State.RecordWarOutcome | 5D5900 / 96 | 8f0251f4c759d67ab8bcfca7939c14604710925cd6f9e61faaf1e094392d5966 |
| NotifyStateDestroyed | 68FD80 / 80 | 103f6540f2c2e08184df70fffaf039a7cd10a1128e27572fe26961cb1a08a49e |

## 接入顺序

1. 不重复恢复本批函数。补尚缺的 goalAchieved/hasStateCollapsed 和三种 effect.Apply 原合同；执行器按既有ExecutePlan证据保留try/finally、实际owner确认及部分失败结果，不能做无条件割地。
2. 原始伤害来源、历月、初始参战快照和销毁参与者必须明确定义网页桥接。旧v27的历史伤亡和快照不补造，保留玩家现有实际损失账。若网页采用可解释适配而非原单位，UI和证据明确标注。
3. 新规则生产接入前冻结v27源/指纹，独立v28和新库，不改变5206或其他已有试玩origin。只有完整候选事务、存档、Worker、浏览器验证后才称新闭环可玩。
4. 之后继续WEB-03-06文化/信仰/命名一致性。全部PH、真机/视觉和发布边界保持。
