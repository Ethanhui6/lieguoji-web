# 原文化与继承增量证据

只读已授权 FantasyMapSimulator 安装目录；GameAssembly.dll SHA256 d42658a922155f6cc60295a64c02207e5eaa1d3a55fd5ed18dc8ecc562f9b82b。PE Unity IL2CPP，通过已有元数据/RVA和窄函数静态反汇编；不是ELF/DWARF流程已运行，不运行完整原作，不读认证/SDK配置/个人存档。

## 文化启用与译名

- InitCultureEnabledStates 71AAF0：先全部isCurrentEnabled+50=false（71AD39）；默认名单按Ciestundu、Leffathou、Oeczea、Wristhos建立（71ADAF/ADC5/ADDB/ADF1）。配置不可用/null/空/没有装载键命中→默认四项与装载字典交集。有任意有效配置键→仅配置有效键，不与默认并集。未读取用户配置。候选顺序仍为主字典枚举，非默认名单强制排序。
- GetCultureNameID 719B80：new List(dictionary+20.Keys)，719BBD/BD2/BFB；包括禁用项，无排序。
- GetMapCultureName 7147C0：语言索引字典+60、译名列表+98；请求语言→English→Chinese→语言字典枚举首个有效→CultureNameID+18。索引非负/不越界、非null/非空；空白字符串有效。请求7148C7、英文714938、中文71499E、遍历714A01–AA1、ID714ADA。null/空语言表直接ID，译名列表null在有效索引访问会异常。
- 未闭合输入：实际用户启用配置、完整模组装载顺序、语言索引表建表来源。网页17明确采用东方命名桥，不谎称六文化默认全开。

## 国家/城市/人物命名三入口

- RandomStateName 493310：复制NameGenerator.dynasties，抽样RemoveAt（493490/4C6）；但抽样结果随后被GetCountryNames408440替换（493514）。按国家索引赋名，跳过index0，仅name==null；越界填out of names（4935EB/61D）。不写文化ID/名称key。这条旧入口不能代表多文化随机命名。
- RandomProvinceName493130：循环world.states.Count，同样抽dynasties（493286/2BC），耗尽局部out of names（4932D4），最终没有把局部结果写回世界/省份。不能凭函数名称它是生产城市命名。
- GenerateCharacterFromCultureInitState838EE0(mapCultureNameID,gender,father)返回人物+实际文化ID；查MapCulture3CB790（838F49），缺失DetermineDefaultMapCultureId717040→EnsureMapCultureExistsForInit838CB0（838F58/F69），仍缺返回null人物+回退ID。有文化则MapCulture.GenerateCharacterName3D2570，gender、null语言、usePatronymic=false、father?.firstName（838FF3）；father.familyId+6C>0且LastName非空覆盖生成姓（839004–02C）；调用已恢复带参CreateCharacter的点为839049。尚未证明所有君主继任都走此入口。
- 原Base/Culture下非东方五文化均有StateNames.csv、CityNames.csv、CharacterFirstNames_Male.csv、CharacterFirstNames_Female.csv、CharacterLastNames.csv。Key+14语言列，本次中文非空。Ciestundu50/250/100/100/50，Leffathou47/250/100/100/50，Oeczea50/250/100/100/50，WesternFantasy197/1000/100/100/50，Wristhos50/250/100/100/50。NameOrder均FirstNameFirst；Western三人名文件与Ciestundu逐字相同，不能称五套不同人名库。
- 10个国/城CSV与既有.autopilot/fms-audit/content/manifest.json SHA一致；本次15个人名CSV只读核查未提取入生产。后续闭合48DF10、3D2570、713040再接命名。

## 继承与任命

- FindSuccessor860DE0–861630：null家族/死者→null。阶段顺序children（存在存活同family）→仅前段空且allowFemaleInheritance再Female children→collateral（存在存活）→members（排除死者ID、存在存活）。任一非空即停止。P=Female&&!allowFemaleInheritance?10000:0；各优先int32为P-age+100、正常600-age、P+1000-age+100、P-age+2100。女性不是硬排除，第一段已经含女儿；没有成年门/优先heirId。排序517DC0直接取ValueTuple+8 Item2 int32，升序稳定；空集合调用CreateVirtualFamilyMember85CA70 Male=0（861492），非纯选择。
- SelectFamilyFallbackCandidate890150–890600：GetLivingMembers84A9D0返回顺序后追加存活collateral，无去重；8922B0只检nonnull&&isAlive+68。年龄降序，然后f32(M+f32(A+C))降序，其中调用Charisma83DFD0（89266D）、Administrative83DF70（89267A）、Military83E330（892687），加法89268C/695。无外交/权重/平均。同键保留输入顺序来自LINQ合同，未反汇编泛型排序器。
- 5172D0有10元数据别名，是共同的对象+28 int32 getter；Character为age，LeaderHistoryRecord为leaderOrder，并非地址标签冲突。null异常，不返回0。新任次=历史空?1:int32(Max(leaderOrder)+1)。
- AppointLeader506C10–508270：只校验国家/新人nonnull，无alive/同ID早返。旧人不同则按捕获国家谓词筛角色→PastRole→RemoveAll（507146/21D）；缓存旧state.leaderId后立即写新ID（507272–281）。新人另一组角色归档promotion并删除（507432/59A）。NationalLeaderRole ctor885870（5075C1），写holder/state/title/reignStartTime+30，加入50768B；historicallyImportant=true507690，同步stateId5076B5；有效家族变化SetRulingFamily86B290（507794），先于旧统治历史收尾EndCurrentLeaderReign5C5BC0（5078B5）。仅currentLeaderRecord为空才建新记录。非initial记录登位507CFC/7D2F；标needNameLabelUpdate507D41，联邦/共和设选举时间与terms1；首个reformer trait触发改革50CD20（507E51）。void，调用方须查真实leaderId，不具整笔回滚。
- 旧角色/历史原因：死亡death/death；hereditary succession/succession；rebellion或coup overthrown/coup；election resignation/election；abdication resignation/abdication；其他活者resignation/succession。
- 尚未闭合：GetLivingMembers顺序、虚拟人物生成、旧角色谓词518800/5188C0、新角色5171D0/517250、Role构造基类startTime+18、SetRulingFamily/EndCurrentLeaderReign/TriggerReform。不能以本批静态合同宣称人物全生命周期已经接入。

## InitCultureNameSet及姓名生成后续闭合

以下三入口和三小选择器由同一只读代理继续静态闭合，无原作运行测试。

InitCultureNameSet48DF10(bool isRegenerateProvince)：48E4A3取已启用文化；为空即报错返回，4900FA虽GetCultureNameID但未消费，不能退回全部文化。newState!=null跳过初始国家文化分配。初始筛选726F90精确为state.i!=0 && cultureName==空串 && State.IsAlive5D15D0；null对象异常，null文化/空白文化不入选，无另行锁名条件。

筛选国数多于文化数时，从剩余国家Range抽取RemoveAt无放回选至文化数个种子，否则原顺序全取；按启用文化顺序赋cultureName+C8（48E7A3）。非种子在不重建省时先取首都省MapCultureNameID+50，非空保留；否则选最近种子。7276B0坐标链为World.CellData+148→Pos+F8，world.burgs+270→seed.capitalBurgID+E0→burg.cell+38，目标为捕获的首都cell位置。dx=f32(seedX-targetX)，dy同，distance=f32(sqrt(f32(f32(dy*dy)+f32(dx*dx))))；7277C3/7CE减、7E7/7EE平方、7F2加、7FB–824开方。稳定升序，等距按种子原序；非拓扑/海陆路径距离。

国家命名按cultureName原字符串分组，先遍历i!=0国家，按文化收集现有_name+48，复制GetStateKeys后List.Remove这些显示_name（不是nameKey，可能移除失败）；余key按随机float键稳定升序。两种排序委托共享726DE0，只tailcallUnity.Random.value2317F40，不使用字符串；每个key抽一次再排序，不是比较时抽签或Fisher–Yates。顺序写nameKey+40（48F117）、_name+48=GetStateName（48F16B–179）、translatedNames+38（48F1CD–1DB）；耗尽写Out of state Names for Culture+文化，不重抽、不清旧key/译表。

isRegenerateProvince=false于48F242–24A返回，跳过城市/省/地图文化注册。true时只处理burg.i!=0&&isLand，无isValid额外检查。未锁城市按所属state.cultureName分组；文化恰好空串才GetRandomCulture并写回，不把null当该回退。锁城按自身cultureName+28收集nameKey+20。各组完整GetCityKeys删锁定key，再以726DE0随机键稳定排序；顺序耗尽时对每个溢出城市从完整原池独立Range(0,count)有放回，可与锁城/此前城市重名（48F92C–943），完整池空只改显示name为No city Names for Culture，不清key/文化/译表。正常写name/nameKey/cultureName/translateNames。

随后totalBurgs=world.burgs副本+seaburgs，按省capitalBurgID取城市，复制name→Province.name（48FBF8）、cultureName→MapCultureNameID（48FC42）、translateNames→translatedNames（48FC8C）。索引越界只写省名None并报错，无自动另选城市。有效陆省id!=0/cells非空/MapCultureNameID非空加入HashSet，再MapCultureManager.InitCultures（48FFF9–4900AE）。因此国家字符串→城市→省→地图文化注册链不能简化为对已有实体统一覆写Base ID。

MapCulture.GenerateCharacterName3D2570只转发到m_CultureData（3D2615），无数据返回Unknown/Unknown（3D25B4–5CE）。CultureData.GenerateCharacterName713040：null/空language取当前语言（7131D1–1F1），语言字典+60缺键立即Unknown/Unknown，无英语/中文回退。gender==0取male字典+38，其余female+40；keys枚举列表Range(0,count)一次→LocalizedName.GetName(index)（713284–30D）。父名非空&&usePatronymic则父名+son（男）或dottir；否则姓字典+48同样抽一次。姓名可重复。

只有first/last恰好Unknown才查默认文化DetermineDefaultMapCultureId（71346E–493），且默认仍需同语言键；先补first再last，各至多抽一次，返回非空且非Unknown才替换（71360A–874、71394F–B30）。last补名还要求!usePatronymic；usePatronymic=true但父名空时可以抽本文化普通姓，失败却不从默认补姓。首次GetName若返回null/空，因不等Unknown，不触发回退。NameOrder不在此函数拼接。

下一可继续的直接依赖：LocalizedName.GetName834BF0、CultureManager.GetStateName/GetCityName 的精确RVA由元数据查得；补齐语言行读取/显示退避即可做独立命名核与限定数据提取。原随机状态序列与网页确定性随机源不同必须明确；多文化生产须让名称在实体/史书创建前落地，不能事后改历史冒充还原。

## 语言行与地点译名（随后闭合）

LocalizedName.GetName834BF0：Key+10、Names+18；负int32索引直接Key（834C27–29→C69），此时Names可以null；非负需Names非null（C2B–32→C78异常），越界回Key（C34–37），有效值IsNullOrEmpty则Key（C45–59），空白有效。Key自身允许null/空/Unknown，不trim。

CultureManager.GetStateName71A290读取StateNames+28，GetCityName719800读取CityNames+30。依次查culture、inputKey；miss直接返回inputKey。命中文化/行不能为null，否则异常。用manager.currentLanguage+30查LanguageToIndexMap；存在则GetName并非空就返回；否则试English；仍无非空值最终row.Key。不读Localization当前语言，不尝试Chinese或遍历其他语言。currentLanguage/cultureName/inputKey直接字典查找，无null键兜底；空串正常查字典。

证据国/城：查文化71A318–31F/719888–88F；查名称71A34F–356/7198BF–8C6；当前语言71A37F–38A/7198EF–8FA；GetName及空值71A3A1–3B5/719911–925；English71A3E9–41E/719959–98E；最终行Key71A420–43D/719990–9AD。若当前翻译为空而row.Key非空，GetName已经回Key，因此不试English；Unknown在地点显示是普通非空字符串。

现已落独立native-culture/name-pool与localized-name模块：原列表删项/稳定随机键排序、国名耗尽/城市有放回重名、首都cell f32欧氏距离、语言行/地点译名退避。尚无生产调用，不改变v17引擎或已有名/史书。独立定向测试单列，不能混称更早开始的全量已经包含这两个新文件。

下一入口：Character.get_FullName83E070、GetCultureDataForFullName83BC90、小写get_fullName83E600；GetNameOrder714CC0/字段m_NameOrder+A0，enum FirstNameFirst0/LastNameFirst1。分隔符、空姓、缺文化显示退避尚未读；不得先假设字符串拼接后宣称原作姓名显示等价。
