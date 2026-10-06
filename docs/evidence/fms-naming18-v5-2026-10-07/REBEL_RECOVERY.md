# 起义身份与复国初始化的后续原作合同

2026-10-07，接续8135ac5本地v18提交。根唯一写入；只读代理按函数分析授权的 Unity IL2CPP PE（GameAssembly SHA d42658a922155f6cc60295a64c02207e5eaa1d3a55fd5ed18dc8ecc562f9b82b）。没有执行原作、改安装目录、读取认证/SDK/个人档。

## 已新增独立代码，尚不改v18

`native-culture/rebel-identity.ts` 实现 CultureData.GetStateName / GetStateNameTranslations，以及 Province.TryRebel 在清空临时国家之后的直接名称、翻译、自定义格式和历史身份选择。起义名单/候选核在rebel-name.ts；输入区分isDead与IsAlive结果，不猜两者等价。临时国家必须由调用者提供，历史目标原对象复用，函数不删除临时记录、不生成家族或宣战。

本核的明确适配守卫：要求传入CreateRebelState已清空_name的结果；此错误检查是网页边界断言，不是原作多出来的游戏条件。最终生产需保留省地图文化，不能从当前占领国推算。没有生产调用者，5189/v18引擎与存档保持。

## 两个名称方法实际属于CultureData

GetStateName715470：language==null才取当前语言，空字符串不回退；先查StateNames，key不存在原样返回key，不访问语言索引表。key存在则先直接索引LanguageToIndexMap[language]，再row.GetName(index)。未知语言抛错，**没有CultureManager的英语回退**；row空时也先完成语言索引。关键7154C8–4E8、7154FE–519、715548、715569。

GetStateNameTranslations715240：7152EF–311创建新字典；key不存在返回新空字典；存在则按LanguageToIndexMap原枚举顺序逐项StateNames[key].GetName(index)，包括返回的fallback key，然后写新字典。没有返回共享翻译对象、不筛空/Unknown、不排序。语言表空时不读row，因此null row不会在空循环中抛错；null key仍字典异常。关键715335–33C、71535B、7153E9、7153FE、715439。

管理入口3CBA30在cultureID null/空/不存在时直接返回null，**不查询当前语言**；只有确实进入3D4380才于3D44E5获取当前语言。初版组合核无条件调用language函数，审计发现并修成惰性获取；空/缺culture以抛错language依赖测试证明不调用。

TryRebel对CultureData有两次实际查询，不能缓存合并：候选key非空后第一次45CDCF GetCulture若null，45CDD7直接走45DCF5异常；历史无命中后第二次45D040若null，才45D04B→45D051只写省名并保留key/译表。独立核初版合并查询，审计新增两个不同时间点消失的回归并拆开，两条路径分开保留异常与省名回退。

## TryRebel的直接身份和状态处理

原候选/省文化/显示名集合详见NEXT_RECOVERY。45CEDF选中首个非空、!IsAlive、同显示名同文化历史国家后，后续目标指针换为历史对象；ID不改。45CF3D解锁isLocked=false，45CF49 restorationCount加一。普通名称/key/翻译保持历史字段；自定义格式复国只Ensure，不清开关/内容。

临时国家此前已由CreateRebelState5092F0在509395赋i=states.Count、5093AF加入列表。TryRebel没有Remove/RemoveAt/Clear/列表替换，不回收临时ID；本函数中仍留空记录，不代表未来帧永不清理。

史书前的直接调用顺序：

1. 45D296–29C筛省内军队，其army.state.i==原国i；45D34B逐个DestroyArmy35A410。不是销毁全国军队/海军，也不是现网页“原驻军一概保留”。销毁的下游损失账仍待恢复。
2. 首都取省首都、中心取省center，数值文化取CellData.Culture[center]；字符串省地图文化与此不是一个字段。45D4DA frameCount清零，45D4ED OnProvinceAdded(province,false)。
3. controllingFamilyId>0时，找到Family则RemoveControlledProvince84B4B0，随后45D541清controllingFamilyId=0；没有删除家族/人物。
4. 新国45D5CC Start(true)。复国政体Kingdom=0/Empire=1在45D5FC Start(false)，随后45D60A HandleRestorationRebellion4559E0；其余Federation2/Republic3/Tribal4/Theocracy5在45D5ED Start(true)。参数由指令确认，不依名称推断。
5. 45D60F isLocked=true、45D61D frameCount再次清零。旧战争入口45D677 StartWar(原国,起义国,2)；V2分支45D6D2 StartWar并在成功后45D6DF写rebelWarV2。45D6EA生成初始起义军。
6. 45D70D–845 leaderId缺失、查不到人物或年龄<16均仅日志，继续，不在此补君主。
7. 45D84A省state指针/45D863 stateID更新，45D87C原国OnProvinceRemoved(province,false)，45D8B7 DistrictManager.OnProvinceStateChanged。
8. 最后FoundedEvent45DBE1或ReestablishedEvent45DC2F，45DC40/45DC73国家与全局史书。

上述窗口不直接清leaderId/currentLeaderRecord/currentLeaderTerms/deadTime，也不清敌国集合和联盟；不能据此断言下游不清。

## State.Start与共同重置

Start5D9BD0–C10：isLocked(+A0)或i(+24)==0直接返；否则InitStateSimulationData(shouldInitFamily)，然后InitializeCurrentLeaderRecord。bool不表示“保留所有旧国状态”。

InitStateSimulationData5D02F0–4F0两路共同：diplomacyefficiency取设置float；isDead=false；foundingTime=(double)float gameTime；UpdateStateData5E0650 → FilterBorderProvince → FilterBorderEnemyProvince → DetermineStateReligion5C4920；traits空才InitTrait；**两路都RandomDestiny5D4560(true)**；外交开战/停战阈值分别float Range(0,设置)；国界dirty；已有联盟MarkVisualDirty；CheckProvinceToAbandon5C1590。唯一bool分支5D04C1–CB：true才InitializeCharactersAndFamilies5D0D30。中途错误不回滚此前写入。

InitializeCurrentLeaderRecord5D1090–15D0：leaderId<=0或currentLeaderRecord存在早退。历史筛选若命中，同一记录移出leaderHistory并设current，不直接改结束时间/原因；未命中且能找到人物才新建，空历史founding/1，非空unknown/Max(order)+1。优先取NationalLeaderRole.reignStartTime(+30)>0（不是Role.startTime+18），否则空历史取foundingTime，非空取gameTime。再取称号和StateSnapshot。筛选委托5DBC30/5172D0/5DBC60及构造快照仍未闭合，不猜。

## InitializeCharactersAndFamilies5D0D30–1090

- isBlankState或!isConquerable早退。leaderId>0、GetCharacter能取到且State.Leader.isAlive，则整个函数早退，连贵族/分地校验也不做。
- 否则GenerateLeaderForState88E1A0(state,out resolvedMapCultureId)。局部有效文化取resolved非null/空否则state.cultureName；不直接回写国家文化。
- 领袖非null：写leaderId；家族起源省默认0，仅capitalBurgID>0且小于burgs.Count才取CellData.Province[burg.cell]，不是BurgData.province或第一省。
- CreateFamily85BD00(leader.LastName,effectiveCulture,state.i,homeProvince)。本体不查同姓/旧家族，但创建器内部未读。
- 写leader.familyId；family.memberIds.Add不去重；patriarchId=leader.id；isRulingFamily setter84C010(true)。无本体founder/heir/role写入。
- Random.value < float32(0.2) 决定allowFemaleInheritance（阈值0.20000000298023224，等值false）。随后GenerateSpouse5C9D40 → GenerateChildren5C83C0(initial=true) → GenerateCollateralMembers5C8940；有省才AllocateRulingFamilyTerritories5BF740。
- 最后不论领袖生成是否null，都GenerateNobleFamiliesWithTerritories5C8DD0(effectiveCulture)，再ValidateAndAdjustInitialDistribution5E1850；不在此清旧leaderId。已有活君主的早退不会执行这些。

## 下一生产切片不可跳过的边界

先冻结v18再建独立版本：持久省地图文化、原候选/旧国身份复用、历史计数与自定义数据保持；网页外交/军队/人口/财政/史书引用要同时一致。原UpdateStateData5E0650、OnProvinceAdded/Removed、DestroyArmy及家族创建深层副作用尚待；未闭合部分只能明确写网页桥，不能靠一套名字核标完整原作起义通过。当前WEB-04-13、原人物完整系统、真机/视觉与发布门均不变。

## 后续HandleRestorationRebellion4559E0–456650已闭合本体

只对TryRebel复国Kingdom/Empire的Start(false)后调用，不能套到所有新国。

- 455CA0 GetAllFamilies8618D0，按枚举顺序取首个family.stateId==rebelState.i且m_IsRulingFamily，455D29–D3C。不是按姓氏、国号、历史国家ID表或旧leaderId。空家族抛错；首个匹配家族无人时不继续找第二家族。
- 455DDB GetLivingMembers84A9D0数量<=0走初始化。此成员定义已在NEXT_RECOVERY闭合：按memberIds取存在、存活、current familyId同此family.id；不去重/不清无效ID。不要重复恢复。
- 455E57 get_Patriarch5E3B40（查找体未读）。族长非null且isAlive，直接455F0F–F19进入任命，不检查年龄、性别、能力或是否旧君主。
- 族长为空/死：再次GetLivingMembers → Where462940 → ToList → OrderByDescending462970(int) → ThenByDescending462990(float) → ThenBy4629F0(int) → FirstOrDefault。谓词与三个键尚未读，不能把日志“age16-60”当真实判断，也不猜排序含义。
- 另选出人时456483写family.patriarchId；选用原/新族长后4564ED写rebelState.leaderId。复用人物/家族身份，未直接改人物stateId/familyId/originalFamilyId/roles、国家currentLeaderRecord或家族所属/统治标记，不能声称完整角色迁移已自动处理。
- 无家族、首次无活成员、筛选无候选：456581 dl=1，456586调用InitStateSimulationData(true)，会再执行前述共同重置与人物初始化；不是仅日志或Start(false)。
- 动态边缘：首次有活成员但后次列表空时，456556–559仅看先前族长引用非null，不再查isAlive，仍可任命。不得合并多次GetLivingMembers并虚称严格每次活人校验。
- 4565D2家族姓氏＋国家名只是String.Concat后Debug.Log，不是重命名“正统国号”；本体不写普通国名/key/译表/文化/自定义名称/国家ID。

最小下一窄缺口：四个候选委托462940/462970/462990/4629F0、GetAllFamilies8618D0返回范围与get_Patriarch5E3B40。失败InitStateSimulationData与家族初始化调用层已闭合，深层GenerateLeader/CreateFamily/配偶子女仍未闭合。独立命名核不执行本节人物路径；接生产时须明确恢复范围。
