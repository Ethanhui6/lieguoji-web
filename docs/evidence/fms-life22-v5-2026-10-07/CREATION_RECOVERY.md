# 人物与家族创建的后续窄批恢复

2026-10-07，原 GameAssembly.dll SHA256 d42658a922155f6cc60295a64c02207e5eaa1d3a55fd5ed18dc8ecc562f9b82b。character_integration_map 每批三入口、family_defaults 每批两入口只读；根唯一写入，未运行原作或读取私人存档。以下不是生产已经接入的声明。

## 文化人物入口 839080–8391A0

按原文化ID查地图文化（8390D9）。有文化才读取父亲 firstName 字段（8390E8），调用 GenerateCharacterName(gender,null,false,fatherFirstName)（839111）；缺文化用两个 Unknown（83911F–126），不默认回退/Ensure，也不直接返回 null。随后父亲非 null 且 familyId>0（83912E–132）才取 get_LastName，首次调用839139后IsNullOrEmpty839143；非空则第二次调用839151并用第二次值。空白字符串有效，两次结果可不同；不缓存第一次代替第二次。最后8385C0创建（839173）接 first/last/gender/原输入cultureID，原样返回结果。未写亲属/父子关系，本体无随机。缺文化仍可用父姓；缺manager是异常。与InitState838EE0严格区分。

## 家族创建 85BD00 / 85BD30–85C780

85BD00仅以null宗教转85BD30（85BD1A/1D）。后者：

1. stateId<=0、!ContainsState 分别拒绝（85BE4C/85BE9E）；GetState85BED8若非null且blank或!conquerable拒绝（85BEE0–EF5）。Contains=true/GetState=null继续；没有IsAlive/IsValid筛选。
2. Family ctor84BC70（85BF4A）→GenerateRandomColor849890（85BF54），随后旧NextFamilyId赋id并unchecked+1（85BF59–68）。不查重。
3. 直接写surname/culture、home/originalHome、state，再foundingTime=double(float gameTime)（85BFC2–CF）；不trim、补名或验证家族名称。
4. 宗教：传入非空→否则正home存在省的GetMainReligionId85C026→仍空重新GetState/stateReligionId85C080–9F→仍空GetRandomMapReligionId(null)85C0C6–CE。null/空触发，空白不触发；最后返回值不复验。
5. 正home重新GetProvince85C12C。省旧familyId>0且不同，则查当前家族字典；找到后RemoveControlledProvince(province.i)，旧家族两个标签/边界标记true（85C14F–16A）。先写province.familyId新id（85C17F），再AddControlledProvince85C182，home与originalHome都改实际province.i（85C18C–195），UpdateMaterial85C198。没有省国家/海陆/已有归属限制。
6. 当前家族字典set_Item（85C217），允许覆盖冲突；不写历史家族、不生成成员、不设统治家族。
7. 总会GetReligion家族宗教用于日志（85C24B）；然后isRecordFamilyCreateEvent才决定是否建史书。事件准备读取原请求home或国家中心位置；再读一次gameTime，FamilyFoundedEvent(id,founderId,"noble_appointment",time)（85C5DC），先全局RecordEvent85C60F，再初次state非null时State.RecordHistoryEvent85C625。没有回滚。

独立核明确将Family ctor/颜色、控制省内部、宗教随机、日志展示及历史位置准备作为端口；不冒充这些未串联依赖已全部生产等价。生产需要私有事务，不能把原函数失败后的局部写入直接安装到玩家状态。

后续审计补证宗教写入不是一个局部值最后统一提交：省返回立即写85C032，国家立即写85C098，随机返回写85C0D3，显式输入写85C0DF。故省返回空串、随后GetState抛错时field已是空串。初稿局部faith一次赋值不符，已按每分支立即写修正，并补省→国家失败及国家→随机失败两项回归；首轮报告保留。

历史前位置读取仍保留异常/调用顺序，但85C4xx所得位置未传入事件构造；初稿多余context参数已移除，原事件只四参。首轮类型检查还发现测试夹具filter参数隐式any，已明确类型，没有放宽检查。

## Family默认值与颜色包装

Family ctor84BC70–84BFA9每次新建十个不同容器，顺序memberIds+38、collateralMemberIds+40、matrilinealSpouses+50、historicalClaims+58、controlledProvinces+78、relations+88、historicalStateIds+98、lastRulingTime+A0、rulingDuration+A8、stateResidenceMonths+B0。前3与controlled为List<int>；historicalClaims/relations/rulingDuration/stateResidenceMonths为Dictionary<int,float>；historicalStateIds为HashSet<int>；lastRulingTime为Dictionary<int,double>。类型槽2EBCCE8/2EFB460/2EF34F0/2EB6AC0已确认，不按共享RVA名字猜。

显式updateDay=1、poleCellIndex=-1、influence=50f、wealth=100、extendedMembers=50、polePos=(0,0)，poleCellIndex再次-1。新对象零初始化给id/patriarch/heir/founder/home/originalHome/state/征服数=0；totalEnemyDestroyed/rallyCooldown=0f；foundingTime=0d；allowFemaleInheritance/skipNextRedistribution/m_IsRulingFamily/两更新标记/isLabelPlaced=false；surname/culture/religion/colorString/familyLabelObject=null；color=(0,0,0,0)。不能把constructor当已有对象重置函数。分配失败异常，无兜底/回滚，不抽色/分配ID/注册/生成亲属。

GenerateRandomColor849890–849922只是manager.get_Instance873D00→GetNextFamilyColor8624D0恰好一次（8498E1）→16字节color复制（8498ED–F0）→ToHtmlStringRGBA22F0AD0（8498FD）→colorString写入（849902–910）。本体不抽Unity随机、不做浮点运算、不夹色、不更新标志或拼#。manager/getColor失败不写color；HTML失败保留已写color和旧colorString。GetNextFamilyColor/HTML下层另批恢复，不从Random名字猜算法。

## 人物注册入口的实质纠正

重新核对838760–8389F0：新Character（内联ctor）姓空串、四基础50、四独立空列表traits/children/roles/pastRoles、alive=true、historicallyImportant=false，其余新对象0/null。838974–97D先计数旧值赋ID并unchecked+1；838997–9A9取float时钟扩double写birthTime；8389C4字典set_Item，然后返回。整个无参入口**没有任何随机**。计数起点1来自已有CharacterManager构造证据。

8385C0–838760先8385D4调用已注册的无参对象，null83874B异常；838602/60F/627/62B写first/last/culture/gender。四次float Range(20,80)顺序魅力838650→军事838682→外交8386A9→行政8386D0，每次立即夹0..100并写；838705 intRange(1,4)，之后取得TraitManager83870E，选择器83872A，覆盖traits838733。无第二轮初始化。常数256D038=20f、256D044=80f、256CE88=100f。traits选择器内部另消耗随机。

旧 fiscal15/CHARACTER_RECOVERY.md:21 “重复初始化”只能指覆盖构造默认50，不能解读为两轮随机；带参入口没有调用GenerateInitialAttributes8391A0或GenerateInitialTraits8392F0。当前v22的单轮能力/特性流与本条不冲突。创建已经注册后才逐项随机；异常不注销、不回退编号或已写能力。traits端口返回null就直接保存null。

FamilyManager ctor873BA0–873D00：新当前字典（873C27–37）和另一个新历史字典（873C5E–6E）；NextFamilyId=1（873C73），NextColorIndex零初始化0；新pendingRemove List<int>（873C98–CA8）；recordFamilyCreateEvent=true（873CAD）；新validFamiliesForNextMonth List<Family>（873CCF–CDF）。无随机/成员/事件/静态实例设置，静态palette不在此初始化。

后续实际依赖：生成器和构造数据已够独立实现；完整家族初始化还需配偶5C9D40、子女5C83C0、旁系5C8940及原关系写入，未知旧档不补假亲属。人物层需容纳未任君主的人，年龄和家族副本不得静默移入旧库。
