# 人物死亡整笔次序与历史构造

2026-10-07，父HEAD3b35488。只读授权原包，指纹沿本目录已有恢复证据；不运行原作或加载私档。`character-death.ts`对应Die83AEB0–83B880，复用已闭合角色类型、PastRole、死亡事件和继承kernel。

1. 83B012先isAlive=false，随后deathTime=double(gameTime float)。没有已死保护/随机/删人物/改年龄或基础能力。
2. spouseId>0查询CharacterManager与对应对象，存在即清对方spouseId；不要求活着、双向匹配，不清死者自己的历史配偶ID。
3. Any角色判断wasLeader；真时重读roles取首个运行时领袖角色，仅该角色stateId>0才查StateManager并缓存state。人物自身stateId不参与，后面的正state角色不替代首个无效state角色。
4. familyId>0查询家族并缓存patriarchId==死者ID。随后无条件DismissAllForCharacter(person,"death")；其返回计数忽略。
5. wasLeader且缓存国家存在时，重读剩余首个领袖角色的Role.startTime算GetYearSince，缺则0；不比缓存state，也不读reignStartTime。重新读取人物ID/游戏时间，创建cause="natural"的LeaderDeathEvent。先全局RecordEvent，再同一event的State.RecordHistoryEvent(false)。
6. 再读当前roles逐一构建PastRole(...,"death")，构造成功后才按需创建pastRoles并append。null角色也交构造器处理。最后按需创建原始roles再Clear；不提前清空或清除历史。
7. 缓存wasLeader/state/非零stateId允许时TryResolve(state,dead,"death")，false不会阻止后续族长交接。异常则中止。
8. 之前wasPatriarch为真且此时familyId>0，重新取FamilyManager及当时familyId对应家族；存在则再次取manager调用HandlePatriarchSuccession。国家继承可能已改变familyId，不能用旧缓存家族替代。

端口异常保留原函数此前部分写入。网页生产接入仍必须使用独立候选世界实现整笔失败不提交。IL2CPP枚举器版本/分配失败不在本核等价声明；生产端口不得在角色归档枚举中修改被枚举列表。

`leader-history-events.ts`另实现：

- LeaderAscensionEvent3A1770先写timestamp、type18；国家null抛错，之后state.i暂存→successionType→stateId→newLeaderId→previousLeaderId。不生成事件编号/姓名，不规范化时间。
- StateSnapshot511970：国家null保留默认0/false；按顺序provinces.Count→VassalManager.GetVassals.Count→alliance对象存在则1否则0→WarManager.GetWars.Count>0→CountWarsFromHistory。联盟数并非成员个数。战争历史计数仍是明确端口，不编造。

检查：`die-first.json`记录本批死亡事务及原死亡统计/族长/角色/国家交接/任命相关回归，目标eslint及全工程tsc通过，类型输出见`die-typecheck.txt`。不与上一批219项累加冒充全量；无本批浏览器/真机或完整原作通过。

生产仍v23/5197，本批尚未接入。已复核旧court16恢复记录：DismissAllForCharacter8820D0与DismissAssignment882810外壳已有静态证据，下一步仅补其国家/assignment/历史去重谓词与必要副作用，复用已实现EnsureGovernmentOfficeData。AdvanceMonth836DC0是实际自然死亡调度入口，需一次闭合后接v24，不再重复死亡概率/生日/家族选择器。
