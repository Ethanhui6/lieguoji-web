# 原家族继承选择：限定三函数只读恢复

2026-10-07，根唯一写入，character_integration_map 与 v13_contract_audit 只读。原包 PE/dump 在项目既有私有审计目录，未运行原作、未读取用户存档。范围为 FindSuccessor 860DE0–861630、SelectFamilyFallbackCandidate 890150–890600、CalculateSuccessionPriority 8572D0–857330。本文记录指令语义，不发布 dump。

## FindSuccessor

family 或 deceased 为 null 返回 null。每阶段构建候选后如非空则稳定按分数升序取首个；后续列表完全不读取。输入顺序与重复项保留。P 为 female(1) 且 !allowFemaleInheritance 时 10000，否则 0。所有算术 unchecked int32。

|阶段|列表|筛选|分数|
|---|---|---|---|
|1|deceased.childrenIds +98|查到、存活、familyId 相同|P-age+100|
|2|仅阶段1空且允许女性时重读 childrenIds|同上且 gender=1|P+500-age+100|
|3|family.collateralMemberIds +40|查到、存活；不查 familyId|P+1000-age+100|
|4|family.memberIds +38|先排除列表 ID 等于 deceased.id；再查到、存活；不查 familyId|P+2000-age+100|

女性已包含第一阶段；不允许女性只是加惩罚，不能改为排除。活女儿足以阻止进入旁系男性阶段。静态输入下第二阶段冗余，仍保留原惰性重读。无成年、能力、heirId、国家、文化、信仰、配偶或父母反查条件。阶段1–3不排除 deceased.id，也不要求 deceased 已死。到达的列表为 null 则异常，不替换空数组。

四阶段空后只在 861492 调一次 createVirtualFamilyMember(family,Male=0)，原样返回非 null 对象，不重新检查存活/年龄/归属，null 不重试。阶段1筛选 860FAD–FBE、分数 860FC0–FE6；阶段2 861073–861145；阶段3 8611D2–129D；阶段4 86132A–13F3；排序 8615AB–15D1。dump 索引 86404。

priority helper = int32((collateral?1000:0)+(femaleInheritance?500:0)+P-age+100)。人物 null 异常；family null 只在女性需要读旗标时异常，男性不读 family。

## fallback

family null 返回 null。先调用 GetLivingMembers 保留结果顺序，再始终遍历旁系列表追加非 null 活人，即使直接成员已非空。旁系不查 familyId，不去重。合并后再过滤非 null 活人。年龄降序第一键，能力降序第二键，同键稳定取首个。

能力 = f32(Military + f32(Administrative + Charisma))，读取顺序 Charisma→Administrative→Military，每个有效 getter 值先 f32。无外交、权重、成年/性别门、随机平局。GetLivingMembers 890294，追加 890323–340，复筛 89042C，年龄 8904EA，能力 8905A8，首项 8905B7。泛型 LINQ getter 精确评价次数未展开，不宣称次数完全等价。数值核限定有效有限 getter 输入；不扩张为任意异常 getter 对象的运行时等价。

## 已恢复依赖，不重复分析

- [GetLivingMembers/虚拟人物](../fms-naming18-v5-2026-10-07/NEXT_RECOVERY.md:31)：普通 memberIds 原顺序、字典非 null 活人且当前 familyId 匹配，无去重或修补。虚拟人物先文化生成，null 返回；写 family/state/religion；浮点 Range(25f,35f) 截零写年龄、写生日、UpdateAge，最后仅追加 collateral ID。无普通成员、父母、配偶、children、heir/patriarch 链接。上游文化生成另消耗随机数。
- [能力小委托](../fms-culture17-v5-2026-10-07/NATIVE_RECOVERY.md:23) 已恢复，旧“未闭合”状态由后续 naming18 证据覆盖。日期/年龄缺口已由 character-calendar/iso-calendar 完成。
- [外层君主继承](../fms-court16-v5-2026-10-07/NEXT_RECOVERY.md:68) 已证实任命失败不换第二个候选。
- [新起义国家链](../fms-naming18-v5-2026-10-07/REBEL_RECOVERY.md:32)：TryRebel 45D5CC → Start(true) → InitStateSimulationData(true) → InitializeCharactersAndFamilies 5D0D30 → GenerateLeaderForState 88E1A0；存在活君主就早退。复国 fallback 456586 同样受早退约束；复用族长/人物不得重抽年龄。当前网页路径不能证明具体原分支，v22 新网页人物仍为未知生日。

下一生产依赖是真实 family.id/memberIds/collateralMemberIds、deceased.childrenIds、独立人物查找、有效能力以及惰性虚拟生成回调。当前网页 family 姓氏字符串不是这些关系，不将独立核误报已接家族玩法。
