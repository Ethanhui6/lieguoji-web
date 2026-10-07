# 后续宣战资格与AI恢复定位（尚未生产接入）

2026-10-07只读GameAssembly.dll，指纹同NATIVE_SETTINGS.md。本批只实现世界/国家开关、期限和月初/覆亡调度；下列恢复用于后续接续，禁止当作新增AI已经可玩。

普通CB1登记在BuildCatalog668DA0第一个对象：Id1，键CasusBelli_TerritorialConquest，AllowedGoalTypes顺序[2,1,3,6]，IsDedicatedAnnexCB=false、AnnexThreshold=1，其余特殊门为false。目录实际ID顺序1,2,3,6,7,8,10,11,12,13,14,15,16；元数据4/5不等于此次目录登记。

## 可直接恢复的资格合同

CanUse6684F0对普通CB依次拒绝：null攻/守、相同对象引用、守国dead；不直接检查攻国dead。随后守国IsBlankConquerable必须为false。检查攻国neighbors(+F8).Contains(守ID)，失败才查neighborSeaStates(+100)；实际查询null集合会异常。先完整调用一次HasCedeableProvince，再按[2,1,3,6]枚举；有可割地则目标2立即允许，否则目标3要求守国陆省恰为1。不能提前跳到单省回退而吞掉可割地查询异常。

HasCedeableProvince68B300：null攻/守/守provinces返回false；先读国级海邻接，逐守省原顺序跳过null/非陆，陆邻接攻国即true，否则海邻国且该省邻水即true。没有港口、不同陆块或网页运输航线条件，也没有再次验证该省当前owner。

IsLandAdjacentTo68B7E0查省邻ID中的可解析陆省owner；IsCoastal68B670查可解析海省。省或邻集合null异常。IsBlankConquerable5D1890为isBlankState(+A8)&&isConquerable(+A9)。

当前war28-goals仍是网页海路适配：buildWar26Goal先需非空selected；海上可割地要不同陆块、同可航海域并有港口。原作海邻国生成尚未核，不能把它们称为同一资格，也不要为了表面还原让军队瞬移到不可达岛屿。后续应保持资格与可执行军令分开。

## 已核AI分支

CanConsiderDeclaring674600/EvaluateDeclaration674F30：攻国存在、未死、非附庸、非和平主义；世界/单国自动外交开启；自上次主动战争与被动参战的完整月份分别>=对应设置，再通过IsSuppressed。此门不直接检查isControlledByPlayer。两个冷却元数据默认12月，但原时间戳初始化与当前设置未恢复。

IsSuppressed6762A0：自身strength，依GetEnemyStates原序对非null且非blank可征服敌国的strength逐步f32相加；总值非正false，否则f32(sum+sum)>自身。严格大于，不再过滤dead。

普通CB EvaluateAiWeight668980：null攻/守或f32(a+d)<=0返回0。share=f32(a/f32(a+d))；hostility=clamp01(f32(-Affinity/50))；expansion=clamp01(f32(expansionism-1))；ambition=IsAmbitious?1:0。逐步f32计算并最终clamp01：share+hostility*.08+expansion*.08+ambition*.04。没有随机抖动。

EvaluateDeclaration保持候选国及可用CB顺序，以f32(.55)为初始best；仅weight严格大于才替换，平局保留先者。选定后仍调用ChooseCasusBelli6747E0覆盖fallback：

1. share>=.75且(守陆<=5或int32(守陆*4)<=攻陆)，CB2可用才掷一次Random，<.8返回吞并。
2. CB6可用则文化统一，不掷骰。
3. CB7可用才掷一次，<.35返回改宗。
4. share>=.65、守陆<=14、守/攻均非附庸、Usable(3)存在则附庸。
5. fallback存在且ID!=7直接返回，不重验资格或权重。
6. 否则返回可用CB1或null。

最后BuildDefaultGoals非空才建声明并StartWar。恢复选理由不等于恢复发动战争。

网页当前缺原affinity、expansionism、两种外交时间戳、候选枚举与海邻接缓存，不能以军事粮策代替IsAmbitious。后续优先EnumerateCandidates.MoveNext672410/1504B、ShouldExemptAffinityForUnification6764E0/240B、GetAffinity8963E0/2144B和国家邻接建立链；TryBuildDeclaration669F60/240B独立入口未逐指令恢复。

## 函数指纹

| 方法 | RVA / 字节 | SHA-256 |
|---|---|---|
| CanUse | 6684F0 / 832 | 79a478abe0d38feb1aaa5a3fa8d701cd44557d2537eff0a3e5ef90e1bd7d22c2 |
| BuildCatalog | 668DA0 / 2688 | 12ba8a8923fe12ad0ce5f965ba04c30ca8f13675c80a693ee4c507ad44fc2eb4 |
| IsAnnexFeasible | 668BE0 / 64 | af04787441f495c80463fd75ae14b7aae498eeb41be7c2ed5b567534a3cb8b77 |
| HasCedeableProvince | 68B300 / 416 | 56e059a3d0ecf8baf5198ecaa256d153cbf3202dea1d646ddb2c448e3df73cb5 |
| IsLandAdjacentTo | 68B7E0 / 400 | 4893b13774439ad3fde939565f259070674f6f0da7024c1716c21f440200a842 |
| IsCoastal | 68B670 / 368 | 1873a96c902500cea155d7c8ba0821d1716150038c518b4b9884a4eecda00aee |
| IsBlankConquerable | 5D1890 / 32 | 6b2b5f093eb8a31dddfa88a9d0a8520dd8da7c159b717a64a3f9f98a56bc1bd7 |
| EvaluateDeclaration | 674F30 / 2240 | 15800b63cc254711f0dd133c883a8d12e7c9ac225710f2e3d5b60dfc122ff582 |
| CanConsiderDeclaring | 674600 / 480 | 9b0bfebeb6f8e88e5767efb64da62f0774a4ac52ab97c246d20c04b996b130a2 |
| ChooseCasusBelli | 6747E0 / 640 | 6750acda8967bb5610b81fb057b0749cd1ece2e3eab4cfea498e8bbf3328c203 |
| Usable | 6765D0 / 96 | 813a287d6b3e48549fa8e1e79881aae121565bbd40c8dd5e0fb34c4daf854c89 |
| GetUsable predicate | 673BD0 / 64 | 845fd228a5ead0d16ea0546ebc30c04db718c6e860d941f3fc4643d27729ec74 |
| EvaluateAiWeight | 668980 / 608 | 024e28203465d77958af56ff7094c34692780d6a9021f486b63272722cd2d7b2 |
| IsSuppressed | 6762A0 / 432 | 1f749cadb104f57fa0a331987e4290877db8441cd06d785bbb88bae094cd88b1 |
