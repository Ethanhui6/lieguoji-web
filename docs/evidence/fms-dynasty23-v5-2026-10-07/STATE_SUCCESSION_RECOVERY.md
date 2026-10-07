# 国家交接外壳与三种政体处理器

2026-10-07，授权原包只读静态恢复；原作未执行。TryResolve外壳已落独立kernel，下面3个非君主handler仅完成恢复，尚未落代码/生产，不可当已可玩。

## TryResolve891750已落核

8917E9–891813依次：state null先LogError再false；private isDead+204真、isBlankState+A8真、isConquerable+A9假直接false。没有IsValid/国家ID/领土/君主alive前置。

891823捕获leaderId+28；仅previousLeader为null且捕获ID>0才891847查人物。外部非null人物原样传入，不核ID/国籍/存活。

读politicalSystem+268，表891C00：Kingdom0/Empire1→88EB70；Federation2/Republic3→88F250；Tribal4→88FA10；Theocracy5→88F560；其余unsupported。前两handler参数(state,previous,oldId,reasonTag,outfailure)，后两没有reasonTag。reasonTag不trim/默认替换。

891947–963按当前leaderId>0且不同oldId确定changed：handlerTrue且changed才true；handlerFalse但changed保留新ID返回false。未changed时failure null/empty才默认，读取缓存_name+48，先891B46警告再891B4B清leaderId=0；日志或handler异常无内部回滚。

网页kernel将原日志格式字符串保留为端口输入，不宣称记录文本已逐字接入。它不任命人物、不做候选选择。

## 三个非君主handler已恢复，待实现

每个入口先outfailure=""。有效候选仅nonnull/alive，任命后立即检查新正ID且不同oldId；失败不挑第二人，不进入无候选diagnostic。AppointLeader为void。所有回调异常保留部分修改。

- Republic88F250：88F345 HoldElection(state,true)；有不同正领袖即true，跳过紧急候选；否则88F379 SelectRepublicOrFederationEmergencyLeader890600一次。有效则88F3C2 AppointLeader(state,candidate,"emergency_election",previous)。reasonTag参数在本体不用。无候选仅诊断并false，不清领袖/结束任期。
- Theocracy88F560：SelectTheocracyEmergencyLeader890CD0一次。previous非null任命类型hereditary，否则emergency_theocracy，不额外证明亲属。无有效候选先88F945写诊断；currentLeaderRecord+2F8非null则88F988 EndCurrentLeaderReign(state,"vacancy")；之后88F98D leaderId=0。有效候选但任命失败不走vacancy。
- Tribal88FA10：SelectTribalEmergencyLeader891210一次。previous非null类型hereditary，否则emergency_tribal。无候选仅诊断false，由外壳处理清零，不结束任期。

无候选诊断：先取FamilyManager，manager为空用新空列表，否则GetFamiliesByState(state.i)；已有manager返回null不能替成空列表。Republic先Sum(living)→Count→格式化。Theocracy/Tribal依次Sum(living)→Sum(eligible)→Count→格式化。委托分别8922C0、892310/892360、8924A0/8924F0，尚未展开。

原诊断文本：

- [Republic] 紧急选举未找到有效候选人 (families={0}, livingMembers={1})
- [Theocracy] 无合适的神职候选人 (families={0}, livingMembers={1}, eligible={2})
- [Tribal] 无可用的部落领袖候选人 (families={0}, livingMembers={1}, eligible>=12={2})

>=12仅为提示证据，不能代替selector真实门。下一窄批只读三个紧急selector890600/890CD0/891210；评分88E8F0/88EA20与HoldElection845810另列依赖。不要反复恢复本页外壳或三handler。国家/族长交接分别处理，不能混成一个headId写操作。
