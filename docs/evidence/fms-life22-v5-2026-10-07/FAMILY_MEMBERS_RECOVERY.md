# 初始配偶、子女、旁系及领地辅助：原作恢复

2026-10-07，原包SHA同CREATION_RECOVERY.md。character_integration_map按三函数+两依赖只读，family_defaults按两函数读领地辅助。无写原包/运行原作/读取私人存档；本文件不代表已生产接线。

## 君主配偶 5C9D40–5C9FA0

无概率/已有配偶/存活/年龄门。leader空异常。性别leader.gender==0?1:0（5C9DB7–BA）；InitState838EE0(inputCulture,gender,null)（5C9DE5），忽略返回有效文化，只取人物；null返回且不抽年龄。先float[-10,10]（5C9E09）再读领袖年龄相加f32，<16才float[16,20]（5C9E22–32）。生日写5C9E79，UpdateAge5C9E7E；不先把估计值写age。

成功顺序：leader.spouseId=spouse.id（5C9E86），反向（5C9E8F），双方marriageType=0（5C9E95/9C）；spouse.familyId=leader.familyId（5C9EAB），leader.getLastName一次并覆盖（5C9EAE/B7）；rulingFamily非null则memberIds追加（5C9EDF）；spouse.stateId=thisState.i（5C9EED）；构造SpouseRole（5C9F15）并填spouseOfId/stateId/holderId/startTime=f32(gameTime)扩double，最后只加入新配偶roles（至5C9F6D）。不改宗教/原生家族/父母/旁系，不调用DetermineInitialMarriageType；familyId与传入rulingFamily不做一致性校验。失败不回滚。

## 君主子女 5C83C0–5C8940

生成次数是本次尝试，不补目标总数：initial int[1,4)；非initial age>40 int[1,3)，>30 int[0,3)，>25 int[0,2)，否则0无人数抽样。次数先于spouse检查；spouseId>0且能查到即可，不检alive/互指/家族/性别。即使count0也查配偶；缺配偶仅initial记录错误，返回。

补核初始leader=null：5C8509先人数draw，5C8511–14才抛；非initial5C8497–9A先判null后读年龄/抽人数。父母5C86E4–5C8702分别gender==0?leader:spouse、gender==1?leader:spouse；非法值两者spouse。人物生成输入father??mother（5C871D–23），两个children列表可能实际同一个，追加不合并。

每轮重新数leader.childrenIds中查到的活人，gender0男其余女，无同家族或去重。男多生女，女多生男；平手才Random.value<=.5女，否则男（5C86C4–DF）。使用family.cultureName（5C8746），传入mapCultureNameID未读；InitState调用5C8752取人物，null消耗尝试且不抽年龄。

child.familyId/stateId/fatherId/motherId先写（5C8763–96）；估计年龄=f32(f32(min(leader.age,spouse.age))-float[20,35])（5C87C3）；<0才int[0,5)（5C87DC）转float。生日写5C8822、UpdateAge5C882C。依次family.memberIds（5C8848）、father.childrenIds（5C886C）、mother.childrenIds（5C8890）追加。建立真实双向亲子，不写旁系/宗教/heir/role，无失败补生或回滚。

## 旁系初始生成 5C8940–5C8DD0

两轮：第一轮int[1,4)（5C89E6）；第一轮及其所有下游婚育完成后才第二轮int[1,3)（5C8BBE）。每次Random.value<=.5女否则男，InitState(inputCulture,gender,null)，不是普通839080；null跳本次不重试。

第一轮先float[-15,15]5C8A97，再读head.age5C8AA5，f32和；<16重抽float[16,25]，>70重抽float[50,70]。第二轮先head.age5C8C52，后float[10,30]5C8C61，f32和；>80重抽float[60,80]。两轮都生日→UpdateAge→familyId→stateId→head.getLastName恰好一次覆盖→**普通memberIds**追加（5C8B74/5C8D1D），从未写collateralMemberIds或与head的父母边。

第一轮更新后age>=25才抽value，严格>f32(.3)调用5C97A0(member,family,inputCulture,false)；第二轮无年龄门，每个成功人都抽value，严格>f32(.4)调用同入口true。不能用年龄估计替代更新后的整岁，等阈值不进入。无head.children/sibling/cousin血缘补造。

## 旁系婚育 5C97A0–5C9D40，SpouseRole ctor88C0E0–88C130

旁系成员空先抛；异性配偶InitState(inputCulture, gender0?1:0, null)（5C988B）；null整个返回、不抽年龄/子女人数。先读member.age5C98A1再float[-10,10]5C98B8，f32和，<16重抽float[16,20]。生日5C9922、UpdateAge5C992D后才检查family空（5C9932）。之后配偶familyId/stateId来自family（5C993E/48），成员姓一次（5C9951/56），双向spouseIds（5C996A/75），追加family.memberIds（5C997C–99D7）。**不写marriageType，不创建SpouseRole，不改roles**。

追加配偶后int[0,2)（isCousin=false）或int[0,3)（true），5C99EC。每轮对子女列表活人按上述性别平衡，tie<=.5女。father=gender0?member:spouse，mother=gender1?member:spouse；非法gender两者均spouse，允许后续同一列表追加两次。InitState(family.cultureName,childGender,father)（5C9BBE），不是配偶传入文化。null不补尝试、不抽年龄。

child先写family/state/father/mother（5C9BD3–BFE）；先读member.age（5C9C04），再float[18,35]（5C9C18），仅member年龄相减，不取父母min。<0改int[0,15)（5C9C31）转float；生日5C9C77、UpdateAge5C9C81；family.memberIds→father.childrenIds→mother.childrenIds（5C9C9D/BC/D7），不去重。18.0原常量256D184，由5C9A0E/5C9B3E引用确认；不能误套普通子女20..35/0..4规则。

SpouseRole ctor只在共用空基链31BD80后写roleType="Spouse"（88C11A）；新对象holder/start/spouseOf/state默认0，没有时钟或随机，不假设执行未调用的Role31E470主体。

## 家族领地列表辅助

AddControlledProvince8493F0–8494C5：controlledProvinces null异常；Contains则原样返回。否则末尾追加，成功后borderFlag=true。接受任意int32包括0/负，不去重旧列表；不读省/国家/World、不改home/originalHome/claim/color/nameFlag。

RemoveControlledProvince84B4B0–84B5E0：List.Remove仅第一个匹配；false原样返回。true后borderFlag=true（84B531），SetFamilyLabelTriggerCheck(false)84B660（84B53D）；然后**重读**列表Count（84B542–553）。非空结束；空则World.Instance→gameObject→GetComponent<StateLineRenderer>；Unity对象非null则RemoveFamilyBorder(this.id)4EE970（84B5CB）。label helper若变更列表要使用新值，抛错保留已删除/flag；World/gameObject原null异常，renderer缺失/销毁正常跳过。两个下游helper体未展开，保留显式端口，不声称只影响展示或无更多状态。
