> 2026-10-08后续调用链更正：本文的外交点数100仅为构造器初值，不是完成初始化的新国开战点数。InitStateSimulationData稍后随机覆盖开战/停战双池；海邻/完整CB也已在后续切片恢复。详见[后续合同](../fms-casus-state-v5-2026-10-08/RECOVERY.md)。本文历史测试与生产未接入的范围保留。

# 宣战决策与好感：当前安装版静态恢复

2026-10-08。WEB-04-37 的后续切片。根唯一写入；只读代理按已知 RVA 读取指定 GameAssembly.dll 及已有合法索引，用已有 Capstone 从 stdin 解码，没有执行原作/恢复脚本，没有访问认证、SDK配置或个人存档。

DLL SHA256：`d42658a922155f6cc60295a64c02207e5eaa1d3a55fd5ed18dc8ecc562f9b82b`。本文件是源实现静态证据，不是原作运行/用户视觉或真机对照。当前新增代码为独立内核，尚未装入 v29。原有 CB1 证据续接 [NEXT_CB](../fms-diplomacy29-v5-2026-10-07/NEXT_CB.md)，不重复拆已核方法。

## 本轮校正和已恢复合同

- CanConsiderDeclaring 自身不含 IsSuppressed。前者依次检查攻国存在/未死/非附庸/非和平主义、World有效且世界/单国自动外交开启、主动完整月差>=设置+88、被动完整月差>=设置+8C；EvaluateDeclaration 在其后独立检查压制。
- ChooseCasusBelli 无条件先 strength(a), strength(d)，计算 f32 share（sum<=0或NaN用.5），随后无条件 landCount(d), landCount(a)，再依既有 NEXT_CB 优先级。不是等守国>5才读攻国数量。
- CB1权重：strength(a)→strength(d)→sum<=0则0→share→affinity→hostility clamp→expansion clamp→ambitious。分项乘法f32；累加为f32(hostility*.08+share)，再加f32(expansion*.08)，再加f32(ambition*.04)，最终clamp。无随机。
- CB1地理函数保留查询顺序；海邻资格不是网页港口/可执行运输路径。完整海邻构建仍待核。

## 候选枚举

EnumerateCandidates.MoveNext 672410：惰性初始化 seen HashSet<int>，Concat(a.neighbors,a.neighborSeaStates)按各集合原生槽顺序先陆后海。Concat先验两个非null集合，任一null都在任何yield前异常。每ID先seen.Add，已见跳过；被拒/无效ID也不重试。不同ID解析同一State不按对象去重。

依次 ResolveState→null/dead/与攻国同引用→a.IsAtWarWith(t)→t.IsVassalOf(a)→t.blank&&!t.conquerable→攻国联盟非null且states.Contains(t)。联盟成员集合null异常，Contains按对象身份。ResolveState对越界ID返回null，manager/列表缺失异常。

目标附庸时依次GetOverlord(t)→strength(t)→宗主非null则strength(lord)否则0→strength(a)。仅f32(t+lord)>a拒绝，相等允许。再GetRelation(a,t)，若非null则先GetYearSince(lastWar double)后GetTruceYears，完整年差<期限拒绝。随后总调GetAffinity，只有>0才调统一豁免；0/负数/NaN不需豁免。无排序、随机或全列表快照；原枚举器变异异常不能吞掉。

ShouldExemptAffinityForUnification 6764E0：攻国null异常；Leader无或HasTrait(Unifier)假则false；strength(a)后才触及目标null异常；strength(t)，sum>0且share<f32(.45)拒绝，sum<=0/NaN继续；GetById(6)无则false，否则尾调CanUse。性格查询与CB6内的再次查询不可跨层缓存。

## 宣战外层

EvaluateDeclaration 674F30：上述前置门→压制→候选迭代。每个候选重新get_Catalog并Where/ToList完整物化，然后才调用任何weight。predicate为cb null异常、Internal则false且不CanUse，否则CanUse。当前候选weight阶段改变目录不会改变当前物化列表，但影响下一候选。

best初始f32(.55)；仅严格>替换，平局先者、NaN不替换。最终target/cb都有才Choose一次；null或BuildDefaultGoals空/null返回null，不找次佳。新声明顺序a.id、t.id、最终CB.id、原goals列表引用；StateTag(a)→StateTag(t)→日志（最终CB但原bestWeight）→StartWar，返回真实结果。内核不能把宣战描述视作StartWar成功。

## 关系与时间

GetRelation896E00是有副作用的创建/查找：无向key=((long)minId<<32)|maxId；无非null项则新建，lastWar=-200d、warCount=0、min/max ID，先append关系列表再Dictionary.Add。因此候选最终被好感拒绝仍可能创建关系。预览应使用私有候选。GetTruceYears896FA0为 int32(roundToEven(f32(baseYears)) * (1+min(3,max(0,int32(warCount-1)))))；relation null倍率项0。默认base3得到3/6/9/12年，不是月份。

两个State构造器5E2510/5E2F20的+188主动/+190被动时间均为 bits `0xFFDFFFFFFFFFFFFF`，即 `-8.988465674311579e307`，不是0/null。GetMonthSince无哨兵特判，历史double经GetDate落最小日期；沿用已恢复character-calendar/ISO桥。写点5E2A61/68及5E3482/89。

## 好感公式及缓存

GetAffinity8963E0输入非null。同一无向key的affinity命中直接返回；miss先查/填atWar cache。公式有方向但cache无方向，同清缓存周期首次查询方向决定两向值，禁止擅自对称化。逐项f32：

1. target或src为IsSuperPower：-100；否则superSuperpowerExists且!IsSuperPower(src)：+25。
2. target.neighbors.Count==1且唯一id=src且!target.IsNearSea：-200。
3. src.HasIntersectLands(target)：-300。
4. src.neighbors含target.id：-25，否则+25。
5. 两features重叠：-25，否则-10。
6. atWar：-500，并sameWar cache.Add(key,true)；否则查/填GetEnemyStates(src).Intersect(GetEnemyStates(target)).Any，共敌则+50。
7. culture int相同：+15。
8. target.Leader非null、traits非null，按序第一个name=SocialButterfly且relationshipBonus>0加bonus后break；不检查leader alive，不累加所有trait。
9. int32(src.provinces.Count-target.provinces.Count)/5截断向0，再clamp[-20,0]累加。
10. GetRelation；非战时且完整年差>minYearsBeforeNewWar且当前值>20，置20。
11. 同一非null Alliance对象：+30。
12. 非战时且GetTruceYears(relation)>=GetYearSince(lastWar)则+100（重新查询年差）。
13. 加有向政体矩阵。
14. 再取target.Leader，存在且alive时加f32(DiplomaticSkill-50)。写cache，无最终clamp。

政体顺序 Kingdom0 Empire1 Federation2 Republic3 Tribal4 Theocracy5，行src列target：
`[[10,-10,10,10,0,5],[15,-30,-20,-20,0,0],[10,-20,20,20,-10,-20],[10,-20,20,20,-10,-20],[0,-10,-10,-10,25,0],[10,-10,-10,-10,0,-20]]`；非法枚举0。

依赖已静态定位但本批尚未完整生产桥接：IsNearSea查任意省isSeaNeighbor；HasIntersectLands先目标borderProvinces再源borderProvinces，!connectedToCapital&&!seaNeighbor&&neighborStates含对方。DiplomaticSkill为base+各trait外交modifier逐项f32后clamp0..100。IsSuperPower来自每月排序；首位true，列表count1时其他对象亦有true分支，第二位strength>first*.5才true。superSuperpowerExists为首位>其余f32总和*1.5。

World.FixedUpdate6AD1E0→UpdateManager6C8E90依次DiplomacyManager.Update、StateManager.Update、ProvinceManager.Update、DistrictManager.Update、TimeManager.Update。仅started&&!paused时清affinity/atWar/sameWar三个cache。GetEnemyStates及GetStrength另受Time.frameCount缓存，不能把外交缓存清理等同即时重算所有状态。

## 下一次生产集成必须遵守的调度（本批未称已接入）

- 每月1日AssignRandomUpdateDays508270按states列表对非null,id!=0,IsAlive者Random.Range(1,daysInMonth+1)，记录updateDay并形成月名单；StateManager.UpdateStates50D980只在对应日期对有效者AdvanceOneMonth。
- AdvanceOneMonth顺序ValidateLeaderStatus→UpdateStateData→UpdateArmy→UpdateDiplomacy。
- State外交总/开战/停战点数+160/+164/+168初始各100f。WorldSettings.cctor6E2240：diplomacyEfficiencyFactor(+64)=20，diplomacyPowerToStartWar(+68)=100。
- UpdateStateData5E0650设efficiency=float(factor)，逐项f32给160、168、164加factor；关闭自动外交仍累积。
- UpdateDiplomacy5DD840先开关/非附庸门及联盟流程；startWarPower严格>阈值才EvaluateDeclaration；返回null点数乘.5，非null清0。联盟完整流程仍待恢复，不能冒充此整体已复刻。
- ApplyWarStarted6832D0对participants：仅Side0&&IsPrimary写主动+188，其余（包括攻方盟友）写被动+190=current time。手动/AI/空白战争同样写；skip flag只影响后续履历。
- v29还没有原生expansionism、外交点数/两历史时间、完整关系/联盟/海邻缓存。这些是下一批真实数据桥和版本隔离的依赖，不用粮策代替性格、用0填未知旧史、或跳过条件宣称原作AI。

## 本轮核心方法指纹

|方法|RVA/字节|SHA256|
|---|---|---|
|候选MoveNext|672410/1504|69aecc26417914644bcf2369bf9e212630fa0db79b639e04d165f4c258001227|
|统一好感豁免|6764E0/240|d317c8e77f18a29cbe66c1ee7db9669578a8382b77d1e720fd4189610a2cef5a|
|EvaluateDeclaration|674F30/2240|15800b63cc254711f0dd133c883a8d12e7c9ac225710f2e3d5b60dfc122ff582|
|GetUsable predicate|673BD0/64|845fd228a5ead0d16ea0546ebc30c04db718c6e860d941f3fc4643d27729ec74|
|GetRelation|896E00/416|b38ee462e367de35230f2a044dea336ac285345f41631cce40214b40b9f26cf7|
|GetTruceYears|896FA0/336|d2b53340d06eeb9912c51a4dfc76aa363e71dc0c5d86060eda1cf9e14845f164|
|GetAffinity|8963E0/2144|e0dae787fc3d76f998327ac35c3f5a527f17bcffd71ca8bff51645f9f93aa747|
|政体好感矩阵|896C40/416|0fb375db740d0682f79b5ef1d378a1b6b0a8b648507321645b8d01185a83b03c|
|get_Catalog|66A050/128|8d820a2a845e6ecc807f4497746155a7bcc8cb506b062fefc183ea44b358ddb4|
|Concat int|C01EF0/144|c5f47335f091fd4444ea931ca5ea41af9373e5089aaf02b043c0860451032473|

其他CB1/Choose/weight/地理方法哈希沿用NEXT_CB；两个构造哈希沿用NATIVE_SETTINGS。调度写点是只读代理新证据，尚未收齐各完整方法span哈希，不把表外写点称作已完成全方法恢复。
