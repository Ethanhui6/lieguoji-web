# 王朝、选举与领袖任命

2026-10-07，父提交20cd1d2。只读原授权GameAssembly.dll，指纹沿SUCCESSION_CANDIDATES_RECOVERY；1–3函数一批，未运行原作。根独占代码写入。

## 本批实现

`monarchy-succession.ts`对应88EB70：先清out failure；FamilyManager空写原错误并false，之后才访问state。统治家族与previous同family时FindSuccessor，null才用family fallback；非null但死亡的候选不会再次fallback。即使已有有效候选，仍先枚举living/collateral诊断计数，再任命。有效任命失败直接返回，不另造王朝。缺候选先写诊断，再选替代家族；先SetRulingFamily再挑其成员；有有效人选任命emergency_dynasty后立即检查，未找到才HandleDynastyChange。两次变更均失败才拼接原失败后缀。reasonTag在函数内不使用。诊断计数、替代家族及完整DynastyChange保持明确端口，不宣称其下游已恢复。

`election.ts`对应845810：只处理Republic3/Federation2；普通lastElectionTime>=0时GetYearSince须满8年（整数转f32比较），紧急或负时间跳过等待。时间回调后再次读取政体选候选函数；空集合/空胜者无事件。DetermineWinner在前，随后按同一候选顺序重新CalculateVoteWeight；每次f32累计，total>0才逐项f32(weight/total*100)，非正或NaN保留原权重，无夹值。读取一次时间构建同一ElectionHeldEvent，依次全局/国家history(false)，再比较当时leaderId；连任仅unchecked currentLeaderTerms++，更换先get_Leader再terms=1并AppointLeader("election")。最后重读时间写lastElectionTime，失败部分写保留。候选、投票权重、胜者、事件构造仍为端口。

`leader-appointment.ts`对应506C10与5C5BC0，依赖复用既有PastRole：

- 只拒绝null state/newLeader并LogError，不额外拒绝死亡、空领土或政体。previous不同人物ID才处理旧角色。
- 518800/5188C0：旧角色仅运行时NationalLeaderRole且stateId等于目标国家；选中副本归档后重读roles并RemoveAll，再日志。旧角色结束原因：死者death、hereditary→succession、rebellion/coup→overthrown，其余resignation。
- 此后捕获旧leaderId再写新ID。5171D0/517250：新领袖所有运行时NationalLeaderRole归档promotion并删除，保留其他角色/空引用，不按字符串或state过滤。
- 885870新NationalLeaderRole只设roleType与reignStartTime；Role.startTime仍0。任命再写holder/state/title和重新读取的reignStartTime，然后加入roles、important=true、更新人物stateId。没有暗中修正原作base startTime。
- familyId>0时三处FamilyManager分别查询family/ruling/set；缺family跳过，缺已到达的manager抛错。所有政体均可变更统治家族。
- 有当前任期、previous非null且不同ID才EndCurrentLeaderReign：死亡death、election→election、rebellion/coup→coup、abdication→abdication，其余succession。与角色结束原因独立。
- EndCurrentLeaderReign：先写endType、f32时间、结束快照、将当前记录加入history，最后清current。时间/快照/列表异常保留之前写入；未额外清leaderId。
- current为空才新建记录，初始reignEndTime=-1和统计0，依次人物ID/姓名/type/开始时间、最大历史order+1（int32）、title、开始快照。不会无条件覆盖已有current。这里是国家第几任，不编造王号几世。
- kind非initial才构建全局登基事件；previousId优先用本函数写新ID前捕获的正国家leaderId，否则用显式previous人物ID，否则0。没有额外的State.RecordHistoryEvent调用。
- 最后名字标签刷新；2/3政体重设lastElectionTime与terms=1；遇第一个canReform特性触发一次改革后退出。traits null跳过，已到达null特性抛错。最终日志仍在改革之后。

快照、姓名、称谓、事件、改革和实际角色的类型解析为显式端口。纯角色解析下保留原RemoveAll稳定次序；不宣称IL2CPP容器版本异常、分配行为或运行时元数据完全相同。

## 检查与限制

首轮monarchy/election 63项，appointment 108项；随后统一回归`succession-verified.json`为219项/8文件全过，包含上述范围与既有候选/家族/角色/原Round，数字不累加。

首轮完整类型检查失败于抛错snapshot端口令泛型P推断never（leader-appointment.test.ts的异常回归）；修为从state直接推断快照类型，没有删除异常断言。统一选举和任命的原字段名currentLeaderTerms。最终目标lint/完整types另有检查记录；不是游戏全量单元、浏览器/真机或完整原作通过。

本批无生产调用，当前试玩仍v23。接下来恢复Character.Die83AEB0整笔次序及实际死亡调度，然后冻结v23，建立独立v24角色/死时/家族heir/任期/统计与事务、Worker/存档/UI。不能把独立核说成试玩已经会自然死亡；不重复已恢复选择器/角色函数。
