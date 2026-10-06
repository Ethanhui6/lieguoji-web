# 原新国家命名与家族继承：只读恢复续接

2026-10-07，三代理按窄函数读取授权 Unity IL2CPP PE 和已有 dump/script 索引；无源码写入、无原作执行、无配置/个人档读取。下列不是本版生产等价声明。

## State.RandomInit 0x5D4660

0x5D47AB–B4 调 GetRandomCulture71A000，从当前启用文化列表作一次整数均匀抽样。0x5D47EC–4823 枚举 StateManager.states.Where(b__0)，0x5D48EE–4906 Select(b__296_1).ToList，0x5D492C–497D GetStateKeys(culture).Where(b__2).ToList。

三个实际委托已闭合：

- 0x728060：只比较 state.cultureName(+C8) 与闭包culture(+10)的 String.Equals/op_Equality165D8C0；没有存活、领土、i、排除自身或非空名称条件。null state进入233680异常。
- 0x7271E0 / 7271E9：读取 state.nameKey(+40)，不是_name(+48)或translatedNames(+38)。null state异常，null key原样返回。
- 0x728090：7280BC取闭包currentStatesNameKey(+18)，7280CF Contains(key)，7280D9 xor1；严格 !Contains。MethodInfo2EE76E0为List<string>.Contains；不做trim/localize/排序。

候选非空：0x5D498E–49AD 一次 Range(0,count)，写nameKey5D49B6，GetStateName后写_name5D49E9，写cultureName5D4A00。没有建图池的随机float排序。候选空：0x5D4A09–4A77发“No more state name in random intialization”警告，key/cultureName/_name全部空，不重抽、不写建图耗尽提示，随后继续其他初始化/InitTrait。

## CreateRebelState 0x5092F0

509359–9376 new State/构造5E2510 → 509380 RandomInit → i=states.Count并Add → 5093BB isLocked=false → traits.Clear → **5093E8–9412 _name和nameKey无条件清空**。509417–9424返回。

该函数没有覆盖cultureName，也不写translatedNames。返回时文化是RandomInit成功选中且有候选的culture，或候选空时的空串；名称不是最终值。不能拿RandomInit直接冒充起义最终命名。下一窄入口 Province.TryRebel45C160 返回后覆盖与相关生成调用。

## 生产现状

v18 仍使用明确父国文化＋初始池的网页新国命名桥，已列在CONTRACT。原全过程闭合后再下一版本接入，不能修改已试玩旧版引擎。原家族继承 FindSuccessor860DE0 与 SelectFamilyFallbackCandidate890150 正在窄恢复，其他函数见旧 court16 NEXT_RECOVERY；现网页同王朝姓氏/任期仍不等于原亲属继承。

## 家族选择已恢复内容与新增缺口闭合

FindSuccessor860DE0和fallback890150实际已在 culture17/NATIVE_RECOVERY.md 记录，覆盖旧court16的“待恢复”。本次重新核查与旧证据一致，不另算新恢复。后续不要再重跑这两函数。

新增 GetLivingMembers84A9D0–84AC00：84AA71取Family.memberIds(+38)，按列表顺序枚举，每项Instance839FD0→m_Characters(+10).ContainsKey/get_Item。84AB58–65只接受非null存活对象，**84AB6B–72还要求Character.familyId(+6C)==Family.id(+10)**；84AB82追加新结果，84ABC0返回。无排序/去重/成年/性别/国家条件，也不清无效ID。memberIds/字典null异常。fallback因此是直接成员中存在/存活/当前家族相同的序列，再追加旁系中GetCharacter非null存活的序列（旁系没有familyId再检），年龄降序，再f32(Military+f32(Administrative+Charisma))降序，同键稳定。GetCharacter839520及Instance副作用仍未展开。

新增 CreateVirtualFamilyMember85CA70–85CC70：85CAE5–CAFB调用GenerateCharacterFromCulture839080(family.cultureName,preferredGender,father=null)，null结果返回null；family/manager空则异常。85CB0C–30写character.familyId/stateId/religionId为家族同字段。85CB35–51取**float Range(25f,35f)**向零截断为age（非int Range），常数字节256CE74=0000C841、256D8A8=00000C42。85CB79–98把age转float调用GetBirthTimeFromAge522C80，返回float扩double写birthTime；85CB9D UpdateAge83DD30后最终年龄才确定。85CBA2–F8只向collateralMemberIds追加ID，不去重；无memberIds、父母、配偶、children、heir/patriarch写入，也不直接覆盖姓氏。没有事务回滚。

下一实际独立核可以实现已闭合的成员筛选、阶段继承优先级/f32能力排序和可注入虚拟成员调用顺序；生产仍缺真实family/member/children输入。生成器839080、生日522C80、更新年龄83DD30未闭合，不能拿记录日冒充生日或补猜亲属。

## Province.TryRebel45C160 的后续命名已闭合直接赋值

45CA3E CreateRebelState返回；_name==空字符串时，45CA8F把省MapCultureNameID(+50)写state.cultureName。45CD8D调用GetRandomCountryKeyExceptNames3CBA30(usedStateNames,currentValidStateNames,省文化)，45CD92写key。两个集合筛选462E60/462EB0、选择器462BA0待窄闭合。

非空key由GetCulture3CB710/GetStateName715470得到显示名，45CEA0–CEDD按全局国家列表找首个非空、!IsAlive、_name同显示名且cultureName同省文化；45CEDF选中复用历史国家，沿用其既有名称/key/翻译。

未复用时：省文化非空且key空→省name、复制省translatedNames（null为新空字典）、key=""；key非空→GetStateName与GetStateNameTranslations715240；省文化空→省name/翻译副本、key=null、cultureName取原所属国。省文化空检查晚于候选调用，不保证候选函数容忍空文化。GetCulture缺失的特殊分支45D051只回退显示省名，不清已有key/翻译。

45D1A6/45D1B7还调用GetProvinceRebelNamingMode5117E0(isReestablished)和ApplyCustomNamingByMode511780(target,parent,mode)，自定义名称最终覆盖尚需闭合。45D3E5–E9首都ID取省首都，45D414–43D设置对应burg.capital=1，45D444–448中心取省center，45D45E–48E数值culture取World.CellData.Culture[center]。省地图文化字符串、中心cell数值文化不能混为一项。

随后State.Start(true/false)未展开；建国45DBE1/复国45DC2F史书在这些写入之后。当前v18父国文化桥与原省文化路径有明确差异，下一版需要持久省文化输入和复用历史国家逻辑，不能只换一个随机名字函数声称接完。

后续三委托已闭合：462E60的used集合筛nonnull、_name非null/非空、cultureName==省文化；462EB0的currentValid同条件且先IsValid5D2820，**不是IsAlive**；462BA0返回_name(+48)而非key(+40)，两集合都用显示名。空白串不Trim。IsValid直接依赖继续窄核。

自定义格式路径已闭合：5117E0返回新起义0/复国2。511780 target为空直接返回，mode1才CopyFromSource（当前链不可达），mode2 EnsureCustomNamingCollections5C6440，其他mode ClearCustomNaming5C2030。Ensure仅customFullNameFormatTranslations(+318)==null时new Dictionary，已有对象与内容保留；Clear先Ensure，再isUseCustomNaming(+311)=false、Clear原字典。两函数不写普通_name/key/translatedNames/cultureName/首都。因此新国清自定义格式、复国保留历史格式，均不复制父国格式，亦不改变前述普通命名。

State.IsValid5D2820–2840已闭合：!isDead(+204)&&i(+24)!=0；seta是无符号比较，负int位模式同样非零有效，不可写signed i>0。不查领土/blank/conquerable，不调用IsAlive。

GetRandomCountryKeyExceptNames管理入口3CBA30：null/空cultureID立即null，地图culture字典按ID直接TryGet，无基础ID/模糊/默认回退；未命中null，值为null或字典null异常。3D4380核心：当前语言索引不存在或StateNames空则null；null两输入各自new HashSet。按词库key枚举，取Names[index]（越过末尾跳过，负索引抛异常），null/空显示名跳过、空白有效；独立构建preferred（不在used显示名集合）和fallback（不在currentValid显示名集合）。先preferred非空整数Range一次，否则fallback一次，都空null不抽签。两池不是排除并集，fallback允许已用名；不回退语言或key、不排序、不去重同译名的不同key，非空输入集合保留自带比较器。关键显示筛选3D472B/475C、抽签3D481B/47FA、空返回3D4856。

至此原起义候选+直接名称/文化+自定义格式合同可落独立内核。State.Start副作用、地图省文化持久化/地理桥、历史国家重新启用的其他外交军事实体一致性仍须下一生产批校验，不能仅因命名核齐全将起义/复国全功能打勾。

根已将候选和名单核实际落入 `src/fms/play/native-culture/rebel-name.ts`：原两组显示名名单、preferred/fallback独立池、当前语言不回退、精确map-ID与一次整数抽样。初轮8项独立测试通过；补原TryGet缺失key路径后最终9项通过，报告rebel-kernel-final.json；这是3017全量之后新增的独立核，**没有生产调用者，不计入v18玩法或3017全量**。新核目录未加入v18引擎清单，已试玩v18规则不变。下一生产批才接省文化、原候选和历史国家复用。
