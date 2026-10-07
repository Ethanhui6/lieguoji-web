# 下一切片：原国运与君主特性动员

本轮只读代理沿既有反汇编与授权安装目录闭合以下函数。未运行原作或恢复脚本，没有SDK/认证/个人存档读取。本文件是实际恢复证据，尚不代表生产接线。

## 普通月度 UpdateArmy 5DBFE0

5DC21F确认战时；5DC534–548要求rebelWar==-1且rebelWarV2==-1，否则各自叛乱增援。5DC553调用isMobilizeForEmergencyAvalible(5E3EF0)。5DC560倍率起始1f，查当前leaderId及traits，原顺序迭代。5DC629–65F任何canEmergencyMobilization=false立即退出；5DC62F–63D只将严格正modifier按addss逐项加入倍率。

5DC819–837数量：ceilToInt32(F(F(F(destiny/F(100))*F(10))*multiplier))。354640将f32扩double，向上取整，再cvttsd2si；2EC110为roundsd 0xA。不是JS合并双精度公式。中性50→5；Hawkish +.3后50→7；没有max(1)，国运0可以0支，且原时间/队列在数量前更新。若网页拒绝零支必须明确改变。

普通月分支不调用公开EmergencyCallArmy，不能重复乘人物倍率。原AdvanceOneMonth在5BF1AC调用UpdateArmy、5BF29A再更新国运、5BF2A4调用特殊强国检查。因此普通月度动员读衰减前国运；v20的财政→国运→动员为已有明确网页调度差异，不作原序等价。

## 原人物特性与默认值

现有native-economy/character-traits.json已按原文件复用，SHA256 80364fe01c1759782e6dad8d9c52eeb44f7963fd88f53fb6f23b2f74157fb797。原Hawkish字段emergencyMobilizationModifier=.3、canEmergencyMobilization=true；Dovish为0/false；其余0/true。

27项中20项省略字段。CharacterTrait构造83A420/83A428明确将can置true，modifier保持对象零值。不要把JSON缺省布尔当false。元数据为CharacterTrait，dump.cs:85054，不是TraitModifiers。

## 公开 EmergencyCallArmy(int requested) 5C50F0

5C52CF–5524先检查君主禁止特性；5C5591–55D9写最后动员时间并入最近队列，超过3只出队一次；5C55DE–5731正modifier顺序累加；5C5775–57B9数量ceil(F(F(requestedInt)*multiplier))。

此入口不检查普通12/60月资格，也不把requested再换成国运百分比。两入口均先筛本国IsStateCore省，空则回退本国全部省；每支独立Random.Range(0,candidates.Count)有放回选地（普通5DC880–8BE，公开5C58F0–592E），调用CreateArmies的isEmergencyCall=true。

UpdateArmy、EmergencyCallArmy、CheckEmergencyMobilization与资格函数已读体内没有destiny(+1E4)/decrease(+1E8)/count(+280)写入或RandomDestiny调用。动员只改变时间、队列、军队与事件，不自行减国运或Manifest计数。

## 独立强国分支，暂不混入普通动员

CheckEmergencyMobilization5C1250：国运<=30，战时，君主允许，IsSuperPower且Manifest计数>0；threshold同国运核；destiny<threshold且F(destiny+decrease)>=threshold；随后floatRange(0,1)严格>F(.3)才触发，再intRange(4,7)×敌国数，传公开EmergencyCallArmy，再应用一次人物倍率。

没有普通12/60月资格门。不能把4—6支或.3门槛套到普通分支，也不能说30%成功。IsSuperPower5D2720→DiplomacyManager8970F0使用sortedStatesByStrength：榜首通过，榜二只有GetStrength严格大于榜首一半才通过；列表一项直接通过。榜单构建/刷新/完整力量来源尚未闭合，不用网页领土替代。

## 依赖与实施边界

先独立核及f32/0支/缺省trait/禁止/只乘一次测试。再冻结v20接下一版：预览、Worker重验、人工动员和月检同源读取真实国运及领袖traits；明确核心优先与网页安全候选的交集、500记录容量、30日月历和普通/特殊入口差异。保留旧固定5规则，禁止原地改变旧档引擎。
