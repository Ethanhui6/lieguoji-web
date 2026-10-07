# 原死亡统计、事件和族长交接

2026-10-07，只读已授权原包，每窄批3函数，未执行原作。数值概率/日期/家族选择器复用已恢复证据，不重复恢复。本文3核尚未生产接线。

## ProcessNaturalDeath839920

manager.MonthlyDeathStats+20：totalDeaths+10、deathAges List<float>+18、deathsBefore40+20、deaths40To60+24、deaths60To70+28、deaths70To80+2C、deaths80Plus+30。

年龄概率命中后839A34先unchecked int32总数++；839A51/64/A95取list并append f32(character.age)；再重新读年龄选桶并unchecked++，最后Die一次并true。分桶为<40、40..60、61..70、71..80、81+。不中不访问/修改统计。函数不建统计、不重置月份、不更新年龄、不另查存活。list或Die抛错保留先前写入；网页整笔世界事务的原子性属于上层私有草稿。

只读审查补实：839A27取stats计总数，839A37重新取stats访问年龄list，各年龄桶分支又取stats（839B4D/839B2E/839B0F/839AF0/839AD6）。不能缓存同一个对象贯穿三处。首轮119项没有该覆盖；已改三次惰性读取与独立null检查，补A/B/C不同对象及第二/第三读null的部分写回归，首轮报告保留。

## LeaderDeathEvent构造3A1FE0

签名(State,int leaderId,string cause,int reignYears,double timestamp)。先3A2002写timestamp，再3A2007写Type=19，然后检查state；依次state.i+24→StateId+20、LeaderId+24、Cause+28、ReignYears+30。无事件ID/姓名快照/时间归一/纠正负值。

Die实际cause="natural"，死者数字人物ID，原gameTime float转double；任期读剩余NationalLeaderRole.startTime整年差，没有角色为0。83B53F全局RecordEvent先行，83B550把同一event传State.RecordHistoryEvent(...,false)，两个回调失败边界不能合并冒充原函数。

## HandlePatriarchSuccession863B70

Die在国家TryResolve后83B7CA检查之前缓存wasPatriarch，重读死者familyId，正值83B7FF查家族，nonnull在83B836仅传family。

函数null家族直接返；查当前patriarchId（包括0），活族长立即返。heirId>0优先取存在/存活/同family人物，无年龄性别门。此支失败且旧族长存在时FindSuccessor，非空结果直接使用，不额外验alive/family。仍无候选才GetLivingMembers按年龄降序稳定取首；年龄getter5172D0复用已恢复证据。空结果只863D60清patriarchId，保留heirId。

有候选863D80先写patriarchId，再863D83写人物important=true。新ID<=0或正ID重查缺失就返回，旧heir保持。重查成功863DBB再FindSuccessor：非空且不同新族长ID则写heirId，否则0。此函数不任命国家领袖、不造角色、不改state、不写史书、不直接抽随机。

## v24接线约束（原v23继续冻结）

现v23 kin仅生成SpouseRole，没有现任君主/族长角色，官职实际记录在court assignments且旧职未存开始时间。不可事后造原角色起任历史。下一独立版本可从明确的新版本来源开始记录，再逐项闭合原appointment。

- 死亡同时改kin.isAlive与court.alive，否则reconcileKin会用court复活人物。
- 捕获死者人物ID/任次后再交接；先清leaderId会令v23 appointKinRuler丢失真实孩子而走网页生人后备。新事务显式使用死者ID。
- v23死亡时间固定0、重要标记false、pastRoles空，旧校验不可放宽；新schema另加heirId、死时/年龄时点、角色历史和死亡统计。
- 死者年龄冻结，不再按当前月全局ageTime要求增长；生者配偶ID被清，死者保留历史配偶引用，允许正确的非对称关系。
- 原国家死亡史Type19与网页旧Chronicle的kind不是一物；新增死亡史需要独立合同，不往旧kind白名单塞值，也不能拿国家覆亡代替人物死亡。
- 人物月初生命时间与世界tick/day必须一致才写史；不得在life已推进、world仍上个tick的中间状态结束任次。
- 真正清理court assignments不能套玩家罢免的领土限制。原卸任开始时间去重、国家TryResolve与非君主handler继续恢复，不能以本核宣布全部死亡已等价。

独立实现：native-economy/natural-death.ts 与 patriarch-succession.ts。生产候选仍v23/5197，不含上述自然死亡功能。
