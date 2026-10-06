# 原作六文化命名：数据与独立内核

2026-10-07，接续本地提交4e0524001a9787966cdc53a6b30f282a77c17ac3。根唯一写入，两代理只读恢复/复核。未改当前v17生产调用、引擎、存档或5188试玩；这里不是多文化已经可选的交付声明。

## 本批实际代码

- `scripts/fms-naming-data.mjs`只读已授权安装目录内明确的六文化，各五种命名CSV和CultureData.json，共36文件，不枚举目录。六份审查后JSON与独立manifest位于`src/fms/play/native-culture/data`。原键、行序、14语言、空值和重复显示名保留；不采用旧内容包的显示名trim。东方城市表英文第559行原空白保留。6份数据共948093字节/5085行，逐结构与当前原文件重读比对一致；18份历史来源SHA与先前内容manifest相同。Western三份人物词库与Ciestundu相同，不宣称6套互不重复人物词库。
- `original-naming.ts`提供独立所有权的Map与行数组，未知Base ID返回null，不将地图文化别名当基础ID。`character-name.ts`落实713040语言缺失早退、性别池、有放回抽样、父名制、Unknown懒回退与抽样顺序。实际随机源由调用者提供，网页将用确定性随机，不能称Unity随机序列等价。
- `full-name.ts`提供原家族/现家族分别解析姓氏和文化、当前/历史家族查询、原姓名顺序、String.Concat。无生产调用者。前批name-pool/localized-name继续保留。
- 定向检查和最终源SHA见`naming-expanded-checks.json`；不混入v17更早的2951全量。代码未进入当前dist，因此本批不重复运行v17全浏览器并称新功能可玩。

## FullName与家族静态证据

仍为同一已核SHA的GameAssembly.dll（见NATIVE_RECOVERY），PE/IL2CPP窄函数静态恢复，未运行原作，未读取个人配置/存档。

`GetCultureDataForFullName83BC90`及`get_FullName83E070`的内联链：先originalFamilyId+A4>0的GetFamilyIncludingHistorical，Family.cultureName+20非null/空串则以原字符串查MapCulture，取其m_CultureData+10；失败再当前familyId+6C，仍失败null。原路径83BCE9–83BD40，现路径83BD42–83BD90，返回83BD92–98。不读Character.cultureName、国家文化或基础文化推断。空白文化仍查字典。两管理器缺失按相应失败分支。

`get_FullName83E070`有文化且GetNameOrder恰为1时，LastName+firstName无分隔符（83E1E9–20B）；其它/缺文化时firstName+单个U+0020+LastName（83E153–171）。姓氏调用83E220而非直接读字段。String.Concat的null当空，不trim，不筛空，不特殊处理Unknown。小写`get_fullName83E600`在83E602尾调用大写属性，无额外缓存。

`GetNameOrder714CC0`先女名Count、再男名、再姓氏，任一非零立即返回m_NameOrder+A0（714CF1–D3A→D64）；全空才DetermineDefaultMapCultureId，恰等EasternFantasy→1，否则0（714D3C–D5C）。不是读取默认文化的配置值。实际访问到的null字典异常714D70，女名非空时不碰后面null池。

`get_LastName83E220`原家族83E251–28C/非空姓83E291–2A6，后现家族83E2A8–2D8/非空姓83E2DD–2F2；取family.surname+18，原样返回83E2F4；两者失败m_LastName+20??空串83E303–31D。空白与Unknown均有效，无缓存回写。**姓氏与文化独立查找**，允许原家族提供姓、现家族提供顺序；不得先选择一个家族再取全部属性。相同ID也不去重。

`GetFamily861DF0`从m_Families+10以原int ID ContainsKey后返回值（861E27/39/42/4F–6B），缺键null，字典null异常861E70；无ID正数/record.id/成员/存活校验。`GetFamilyIncludingHistorical861C90`先GetFamily861CA2，非null直接返回861CAA；否则查m_HistoricalFamilies+18同ID（861CD3–D17），包括null值。历史字典null异常861D1C。当前存在但内容空的记录不会与历史记录补字段。

`DetermineDefaultMapCultureId717040`调用一次Localization.GetCurrentLanguage3B80D0（71709D），null/空→WesternFantasy（7170AA–B1→FF）；否则IsCNType3B9880（7170CD），true→EasternFantasy；否则StringComparison.OrdinalIgnoreCase=5与Korean比较（7170D6–F0），相等东方，否则西方。不检查启用/加载/数据池、不随机、不trim。`IsCNType3B9880`只读静态cnSet+28并HashSet.Contains（3B98D0–EF），null集合异常3B98F4；集合成员/比较器应以cctor3BA640补证，不以函数名猜中文别名。

随后只读补齐cctor3BA640：3BA8C4–D0创建HashSet，3BA8DC–E6无参构造，依次Add Chinese（3BA8F5–FC）、Japanese（3BA90B–12）、TraditionalChinese（3BA921–28），3BA93E写cnSet+28。默认字符串比较器，前三者区分大小写，无trim；Korean单独不区分大小写。`default-culture.ts`和回归已落实，输入为实际原语言字符串，不把网页zh/ja别名伪当原枚举。

## 下一生产批的准确接线位置

代理只读核查现代码：v17 create委托Upper14→Terrain13→Chronicle2→ChronicleSession；district-world:111–120已创建实体名字，regularMuster在chronicle-session:30又写军团名与世界事件；随后initialChronicle已有leaders但entries初始为空。court16-people只复制ruler姓名，不是生成入口。

因此下一版必须在自己的world factory实体构造之前分配文化/国城名，在自己的records/politics建立君主及announce之前取对应人物名。后置统一替换会污染旧事件快照，不能采用。自动/手动传位、独立、复国都须改同一新路径。原core、chronicle严格exactKeys，名称Key/Base ID/mapCulture/语言/锁名来源需独立新sidecar，以既有nation/city/province/ruler ID引用；未知旧档名字保留legacy来源，不反推假Key。

先冻结v17，再建立新版本执行/存储/指纹；旧names、district-world、chronicle-records/politics及词库均处冻结链，不得修改共享生成器后刷新旧指纹。多文化没接完前5188仍明确东方命名，不显示假文化选择。原完整家族生命周期/真机/视觉/正式发布仍未完成。
