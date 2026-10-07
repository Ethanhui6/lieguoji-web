# 战争 V2 后续静态恢复检查点

2026-10-07，父 HEAD 0461445。根唯一写入，三个既有代理只读分析；本批不派生 v27，不改变 v26 生产行为。本文件保存本轮已完成分析，避免后续重复恢复。它不是运行对照、完整实现或测试通过证据。

来源：只读用户指定 GameAssembly.dll，SHA-256 `d42658a922155f6cc60295a64c02207e5eaa1d3a55fd5ed18dc8ecc562f9b82b`，既有 dump.cs/script.json 元数据。没有运行原作、旧恢复脚本，没有读取认证/SDK/个人存档。方法跨度包含对齐；分数函数 SHA 由根按 PE 节表将 RVA 映射到原 DLL 字节后独立计算。

## 1. 完整目标选取入口

`WarProvinceQueryV2.BuildConnectedClaimProvinces`，RVA 6891D0，2800 B，SHA `7dfc0bd656a861291ac4301aa2e07729b5d3e2436ef202650f62eba066861679`。

输入 attacker/defender/defender.provinces 为空或 requiredCount<=0，返回空列表。按 defender.provinces 原顺序收集非空陆省为 allLand，没有再检查 stateID；另外按 IsLandAdjacentTo(p,attacker.i) 收集 landEntries，按 IsCoastal 收集 coastalEntries。目标数 min(requiredCount,allLand.Count)，<=0 返回空。

先排序 landEntries，再调用 GetSeaApproachDistances；从 coastalEntries 中按距离字典 ContainsKey 筛出 reachableSeaEntries，按海路排序；全部 coastalEntries 另按旧海路排序。

核心次序：

1. 有 landEntries 时，先把**所有排序后的边境入口**依次加入 result/selected，达到目标数立即返回；不是从第一个种子先长满。未满时以 landEntries[0] 为距离锚点调用已有 GrowClaimFrontier。
2. 无 landEntries 时，种子依次选 reachableSeaEntries[0]、coastalEntries[0]、allLand[0]。种子须非空、陆地、stateID==defender.i、未选，加入后 GrowClaimFrontier。
3. 仍不足时，用新的 seen 集合按 landEntries → reachableSeaEntries → coastalEntries → allLand 顺序追加去重后备候选。依次对未选候选调用已有 GrowClaimComponent，直到够数。

因此，原函数会启动多个分量，可能走不可达海岸/全部陆省后备；名称 Connected 不保证单连通或海路可执行。v26 的单连通、实际可运输约束是网页适配，不能追认成全原函数。完整移植时须显式记录这个差异，不能破坏现有执行安全来伪装等价。

### 排序和薄辅助

所有比较取第一个非零 CompareTo，最后按有符号省 ID 升序。浮点用 Single.CompareTo：NaN 小于非 NaN、NaN 与 NaN 相等；不使用 compact 的 .001 容差，不能简单相减代替。

| 入口 | 比较优先序 |
|---|---|
| Land | isConnectedToCapital=true 优先；IsProtruding()=false 优先；CountBorderContactCells(p,attacker) 降序；距任一攻击方陆省最小距离升序；距攻击方首都升序；ID 升序 |
| Reachable sea | seaDistances[p.id] 升序（真实索引，缺键非 Infinity）；IsPortProvince=true 优先；距任一攻击方陆省最小距离升序；ID 升序 |
| Legacy sea | IsPortProvince=true 优先；距任一攻击方陆省最小距离升序；ID 升序 |

- CountBorderContactCells：遍历 borderNeighborCells+0xB0，跳过越界 cell，CellData.State[cell]==attackerId 则加一；不去重，不是邻省数/边长。CellData.State backing +0xA8。
- NearestStateProvince：省/国家/国家省列表空时 float.MaxValue；遍历非空陆省取已恢复 GetProvinceDistance 最小值，无 stateID 二次校验。
- 陆地排序首都：State.capitalBurgID+E0 → World.burgs+270 → BurgData.cell+38 → CellData.Province[cell] → GetProvince；burg 索引 0 允许；空/越界得到 null，不用第一省代替。
- IsPortProvince：省/World/burgs 非空，Province.capitalBurgID+64 **>0** 且界内，burg 非空且 **isValid+66** 为真，再调用 IsBurgPortQualified(burg,world,20)。+66 不是 isPort。
- AppendUniqueEntries：按原序跳过 null，以 ID 加入新 seen，首次成功追加省对象；不检查陆地/国籍。

| 方法 | RVA / B | SHA-256 |
|---|---|---|
| Land lambda | 67EC80 / 448 | db81b9ef1d2ed9b220f372a7b20f4544fa12b3f9efabb29e76c329d9b38f7201 |
| Sea lambda | 67EE40 / 336 | 6745c283e3c883b2b4424c530e8e919afcbd95c9aa0158e0e04cadcc2a2aed65 |
| Legacy sea lambda | 67EF90 / 224 | c49158cfe2945c396f0185f919ed9f56dafc8aad6d71929d5fd03c24e1d72c91 |
| SortLandEntries | 68BDF0 / 576 | 5384c951c74b2e9d94f80e0a03e59c9d2f86c6d82363e3c63d2690e426d388c7 |
| CountBorderContactCells | 689CC0 / 448 | 3d679935a0f725893170e86fa749d9126343c1ecbb5baea15057043daa1caf6e |
| GetDistanceToNearestStateProvince | 68A3E0 / 432 | d24890e317f011e219a974bbe0965fec7d18303fc73d0bbd8bf708a28dd36c69 |
| IsPortProvince | 68B970 / 208 | 3a69a3fb7b5be6f9801c1c5508be5a8c2c2f23cc4e92746d54098f0bc2ebd451 |
| AppendUniqueEntries | 689070 / 352 | b442339f49d55329bc7fa2bb7fa2b915ca29985c1730e4deb45551906854bc28 |

保留未展开依赖：GetSeaApproachDistances 68A7A0（常量最大 4 原省跳数，不是网页三角面），IsLandAdjacentTo 68B7E0，IsCoastal 68B670，Province.IsProtruding 458930（不能直接用 +9D 缓存），IsBurgPortQualified 496E30。已有 Grow/compact/distance/HashSet 不重复恢复。

## 2. 战争分和目标进度

下述 f 表示 Math.fround；每一步对应 SSE 单精度中间值，不能先 double 运算后统一 f。int32 累计/减法 unchecked。合同覆盖普通有限游戏输入，没有声称损坏运行时/NaN 载荷位级一致。

WarSide：Attacker=0，Defender=1，None=2。CalculateWarScore(null)=+0；其余：

```text
occupation = clamp(f(SideLoss(defender)-SideLoss(attacker)), -1,1)
attackerKills=SideKills(attacker); defenderKills=SideKills(defender)
sum=f(defenderKills+attackerKills)
battle = sum<=f(.0001) ? 0 : clamp(f(f(attackerKills-defenderKills)/sum),-1,1)
goal=clamp(f(AverageGoalProgress(attacker)-AverageGoalProgress(defender)),-1,1)
combined=f(f(battle*f(.2))+f(occupation*.5))
combined=f(combined+f(goal*f(.3)))
score=f(clamp(combined,-1,1)*100)
```

正分有利攻击方。没有直接读取死亡、月份、疲劳、开战理由或 IsPrimaryGoal。

### 分量输入

- SideLossFraction：先 Participants 后 DestroyedParticipants，按 Side 过滤，**不去重**。initial 累加 InitialProvinceCountByState[id]（缺键 0），current 累加 CurrentProvinceCount(id)。initial<=0 →0，否则 clamp01(f(f(int32(initial-current))/f(initial)))。
- CurrentProvinceCount：StateManager 必须存在；id<0/越界、state 空/死亡/provinces 空 →0，否则 provinces.Count。**海省、空元素、重复项也算 Count**。
- SideKills：同上两个列表顺序，按 Side 过滤，KillsByState 缺键 0，每次加法 f32；重复国家重复累加。
- AverageGoalProgress：两个参与者列表按 Side 收国家 ID set；Goals 按原序，仅 GoalType 0..4 或 6..11、AddedByStateId 属本方的目标等权平均。排除 5；不使用 IsPrimaryGoal；目标不去重，sum 每次 f32，count int32。0 个目标→0。参与者或 goal 的 null 访问异常，不静默跳过。

### 外战 CalculateProgress

war/goal 空 →0；内战转下一节。外战 enemies **固定取当前 Participants 中 Defender 方 ID**，不按 AddedBy 翻侧，也不纳入 DestroyedParticipants；空集合加 PrimaryDefenderId（没有正数检查）；TargetStateId>0 再加入。

范围：GoalType 3 Annex /4 Vassalize /11 EnforceReligion 从 InitialOwnerByProvinceId 按原枚举取 owner==TargetStateId 的键；其余从 TargetScope.ProvinceIds（scope 空异常，ProvinceIds 空视为空列表）。所有类型再过滤：快照有键、初始 owner 在 enemies、当前 GetProvince(pid) 非空且 isLand。**不排序、不去重**。

范围空 →1。按范围每项再次 GetProvince，若省空或当前 stateID 不在 enemies，算 achieved；不再检查 isLand。第三国或中立拿走也计达成，不要求由攻击方持有，没有持有时长。

GoalType2 OccupyCount /6 WarReparations 的 denominator=clampInt(RequiredProvinceCount,1,range.Count)，numerator=min(achieved,denominator)；其余 denominator=range.Count、numerator=achieved。最终 clamp01(f(f(numerator)/f(denominator)))。重复省重复计数。

### 内战 CalculateInternalProgress

- 类型7 Independence：先 ResolveState(target)，不存在/死亡/陆省数<=0 **立即返回1**，优先于受益国判定。否则 beneficiary 不存在/死亡/陆省<=0→0；InitialLandCount(beneficiary)<=0→0。threshold=max(1,int32(ceil(double(f(f(initial)*.5)))))。再查询一次 beneficiary，返回 clamp01(f(f(CountLand(currentBeneficiary))/f(threshold)))。
- 类型8 OverthrowRuler /9 ReformGovernment /10 ClaimThrone：target 不存在/死亡/陆省<=0→1；initialLand(target)<=0→0；再查询 target，返回 clamp01(f(f(int32(initial-currentLand))/f(initial)))。
- 内战其他类型→0；不检查 minMonths，不调用 IsAchievedInternal。
- InitialLandCount：遍历开战 owner 快照，owner==stateId 且**当前**省存在/isLand 时计数。不用 InitialProvinceCountByState。
- CountLand：state/provinces 空→0；只跳 null 和 isLand=false；重复项重复计数，不查死亡/归属/有效性。
- ResolveState：id<0/越界→null，否则返回列表元素，不检查死亡。管理器/到达的列表 null 属异常。

查询重复和顺序不可合并；范围构建与 achieved 阶段允许同一查询端口返回不同结果。ceil 2D3060 复用已有 DEATH_ROLE_RECOVERY.md，不重复恢复。

### 原始数据偏移与方法指纹

WarV2：PrimaryDefenderId+18，IsInternalWar+20，Participants+30，DestroyedParticipants+38，Goals+40，KillsByState+50，InitialProvinceCountByState+60，InitialOwnerByProvinceId+70。Participant：StateId+10/Side+14。Goal：GoalType+14/AddedByStateId+18/TargetStateId+1C/BeneficiaryStateId+20/TargetScope+28。Scope：ProvinceIds+18/RequiredCount+24。State：provinces+108/isDead+204。Province：stateID+78/isLand+89。偏移均十六进制。

| 方法 | RVA / B | SHA-256 |
|---|---|---|
| CalculateWarScore | 68C670 / 384 | aa8f4e14b201104c6230922535029a972c6dc5aca5d5eae01225168ced6c65a8 |
| SideLossFraction | 68DC00 / 688 | ccac1da61ba7e6a9a6a61b5f1d81bde665753a50ba13aafa6cba68ba7928074f |
| SideKills | 68D9A0 / 608 | 1c74b4787ee0e7f1bc676e2df106cb5caf37804504d7a673356267b4faa68e6f |
| AverageGoalProgress | 68C1F0 / 1024 | 3e6fe6af2d3f24aae09590dfc1ae9fb248bc790bedc27a0a0d0716eb827bf199 |
| CurrentProvinceCount | 68CA40 / 192 | 447f14cb8b69d550a4ca1bce7c2396547ed713deb305d9571f7ffa813eb52f7a |
| CalculateProgress | 681020 / 464 | db4e4be3e2568ed502d8cbdf3c102aa4f344de990c73aa5d69f0bcd394b3a91c |
| CalculateInternalProgress | 680E00 / 544 | b1c85c20e7eac880eb78a7eeb9cfc917c0bf45c789bbe20f277dc3a580142434 |
| EffectiveProvinceRange | 6811F0 / 752 | 1097ff32fdf75b4ad4be802e36f756290b2a7db0675650f4b5af3c39e413c006 |
| EnemyStateIds | 6814E0 / 496 | c1399b5f5b8ada747899f20efc199ea1b9ffaf6b8ecc5cce9b72aaa2faf62fc1 |
| InitialLandCount | 6816D0 / 336 | 26963620f0799826307463bb269784233972379fe032d789cf8ff9e0d28df83c |
| IsEnemyHeldNow | 681B70 / 160 | aa45d7308aeea0c5f9cd3ad1da6b9f7d6b2bf3149c7d354bdac695c6648f230e |
| IsLand | 681C10 / 112 | a26fd542fd2db13a025f749b35d9bc2853ba6b1b0b04416ee18762d1583d3ac5 |
| ResolveState | 681C80 / 144 | f0fb38e5d1820f89b2e03588b3d56d3d5bb3f456cec09b0e9188bfda063c22fc |
| CountLandProvinces | 689E80 / 304 | b419a53ae06e6d2b5f7ffe88b7909537bf8213df7d62d8c0f6ddac2c1a769729 |

源定位：dump.cs WarSide 58856，GoalType 58895，TargetScope 59053，GoalInstance 59070，Score 59606，Participant 59732，WarV2 59818。相关谓词：range source 67F1C0、key 67E9E0、range filter 67F210；achieved 67EBD0。尚未恢复管理器整体、快照创建时机、击杀登记、destroyed 转移时机、Weariness/月份/和约执行。

## 3. 网页实际接线审计（只读）

不能用整 tick 兵力差、kind=battle 日志或 Engagement.losses 反推累计击杀。

| 真实入口 | 注意事项 |
|---|---|
| restoration19-battle.ts pulse 77–88，由 war26-runtime.ts:23 advanceCombat 调用 | 实际 clamp loss 在88行；84–87仍有攻击军贡献。只改 war26-core.resolveBattles 覆盖不到实时路径 |
| restoration19-battle.ts retreat:20 / applyBattle withdraw | 路段撤退即时损失2.5%；非tick手动命令也要入账 |
| restoration19-core.ts moveArmy:222 | 节点撤退实际离开时的2.5%追击；需保留当时敌军来源 |
| restoration19-core.ts forceRetreat:261 | 无安全路线时 destroyArmy 归零；无归因证据不能全部写作某敌国击杀 |
| tactics-sea.ts:36–42 | incoming 汇总前保留来源；实际舰体、船员、首次lost、沉船载军分别计。仅战斗导致沉没时归因载军损失 |
| fiscal15-occupation.ts:41–44 | siege.resistance下降不是 troops 死亡 |
| war26-core:201/navy:69/transport:73 | 断粮分别计，不增加敌方击杀 |
| reorganization:15/28、dynasty23-politics:74 | 同tick补兵/重用ID与起义清军会污染净差统计 |

Engagement.finish:42 清理离场军及整场 losses；MaritimeState 没有累计损耗。多国交战整数余量和已有 carry 无来源，需明示新的分摊适配，保证所有敌国分到的总数等于实际损失。不能每个国家各领全额，也不能追溯伪造旧局战损。

War26Campaign 当前 a/b 是排序后的双边ID，缺真实进攻方/CB/初始总兵力/击杀；reconcile 首次观察可能是复制旧局的接入时刻。真实发起方应在 fiscal15-food.ts:191 陆上外交、war26-voyages.ts:85 海外外交、war26-session.ts:88 手动宣战的实际入口记录。

现有 make-peace 路径：session → restoration19-commands → core.applyStateAction → tactics-statecraft.enact:99。改为 peace、sinceDay 当前日、10日停战，保留当前已开始路段并截断后续不合法路线，随后协调战斗/海战/围城。自动和约须提供真实原因，不能沿用“玩家沙盒干预”文案。

dynasty23-politics.reconcileSovereignty:102 领土归零只写覆亡/结束君主任期，不删除国家残军城市，也不自动改和平。war26.reconcile 只在 war 关系消失时关闭战役，所以两者目前独立。自动结算应先入账当前tick真实损失，再同事务停战，防漏记和和平后继续扣伤害。战斗暂停在完整tick后，不能回滚已提交tick。

真实政体在 upperCombat.nations[id].polity（Kingdom/Empire/Federation/Republic/Tribal/Theocracy），不能从 regimeId 猜；文化在 restoration19-culture，法理归属与实控分开。当前没有结构化宗教战争理由，不能从 Theocracy 自动推断信仰/仇敌。

## 后续执行边界

可以先实现上述独立有测试的纯函数，但在开战快照、参与者、累计伤亡、结束事务接通之前不能显示假战争分/自动胜负。v26 已提供本机试玩，规则变化必须冻结后使用新规则与独立库；5204 已有用户世界，验证用新 origin。原统计/查询恢复不是全量原 AI。真机/视觉与发布锁保持；本批没有新测试或新可玩行为。
