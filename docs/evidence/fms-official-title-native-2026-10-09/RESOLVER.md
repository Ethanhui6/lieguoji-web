# 原作官职称谓：三个函数的静态恢复

2026-10-09，接续用户截图01、04的官职称谓界面。当前完整浏览器验收44710仍使用不可变52c5626产物；本资料不修改该候选，不表示网页编辑器或原作整套官制已完成。只读分析由character_integration_map执行，root保存合同；没有运行原作、恢复脚本或新增测试进程，没有写安装目录。

## 输入与证据身份

实际来源为用户授权的 `D:/steam/steamapps/common/FantasyMapSimulator/GameAssembly.dll`。root本批重新计算完整SHA256为 `d42658a922155f6cc60295a64c02207e5eaa1d3a55fd5ed18dc8ecc562f9b82b`，与既有pe-summary一致；文件53442048字节。对应 `FantasyMapSimulator_Data/il2cpp_data/Metadata/global-metadata.dat` 的完整SHA256也由root本批重算，为 `07c80936dc520b83fdef941562f05b98f6a33ed5f9d768b42ac2a371266a1018`，与既有12223432字节/v29摘要一致。

名称、类型和字符串定点索引来自已存在且忽略的 `.autopilot/fms-audit/binary/dump/dump.cs` 和 `script.json`。dump的工具日志未提供导出文件哈希链，不能将它称为经过独立签名的源码；本次使用当前PE节表、异常目录、实际方法指令和定点索引交叉定位。完整二进制、元数据、dump和原始指令不加入本证据目录或dist。

PE ImageBase为0x180000000；目标il2cpp节RVA为0x304000，文件偏移0x302600。以下方法范围都为半开区间，哈希由只读分析实际计算：

| 方法 | RVA范围 | 文件偏移范围 | 字节数 | SHA256 |
| --- | --- | --- | ---: | --- |
| ResolveDetailed(profile, polity, officeId, gender?, language, ignoreOverride) | [0x888D40, 0x889759) | [0x887340, 0x887D59) | 2585 | b5efcd7ec4d607ecfbaf0fd178db839f2409562df784cb4d8dcf6af5f632e244 |
| State.GetEffectiveOfficialTitleProfile | [0x5CAB60, 0x5CACB2) | [0x5C9160, 0x5C92B2) | 338 | c46a87751fa1031a134bfcb9d9b4ba88f03861793b88ef70c80d618282355b74 |
| TryResolveTranslations | [0x88A810, 0x88AB06) | [0x888E10, 0x889106) | 758 | 46572f6417f747f66de9f4f8e06f51741fad1ce2c549e01f7bd7e20eca753b40 |

第一项.pdata序号37994、UnwindInfo 0x2C841F0；读取窗口包含尾部填充至0x889760，共2592字节，SHA256为8a05330e51e26c9c2c9cc143930dc062ea59594c5e059f2ef111b14972026fb2。第二项由30357—30360四个连续链式片段组成，分界0x5CABF0/0x5CAC5D/0x5CAC8A；不能只取首片144字节。其含填充读取窗口至0x5CACC0，共352字节，SHA256为de30be271fb709fc8372af40f6aa4ab30191aa0f5d830767137ba6704f0fbe8e。第三项.pdata序号38007、UnwindInfo 0x2C84280。

## 一、国家选哪一份profile

绑定枚举为InheritCulture=0、Custom=1、MapDefault=2。三者是选择模式，不是固定的“先自定义再文化再地图”串行查找。

1. 国家binding为空时，调用CreateInheritCulture(0x88C230)并写回state+0x10。随后调用binding.EnsureInitialized(0x88C2A0)，重新读取该国家字段。
2. 初始化后的mode=Custom：再次调用该binding的EnsureInitialized，重新读取国家binding，直接返回CustomOfficialTitleProfile(+0x18)。此函数不为返回null追加文化回退。初始化器是否会自动补profile未在本批展开。
3. mode=MapDefault：直接返回null，交由后续ResolveDetailed的null-profile路径解析地图；这里不自行读取地图profile。
4. 其余初始化后的mode：使用state.cultureName(+0xC8)，不是数值culture(+0xC0)。非空白时获取MapCultureManager(0x3CD260)，先GetCulture(0x3CB710)，仅返回null时再GetMapCultureByNameID(0x3CB790)。
5. 找到MapCulture且其CultureData(+0x10)非null：调用EnsureOfficialTitlesInitialized(0x7126C0)，直接返回CultureData.OfficialTitles(+0x10)。找到MapCulture但CultureData为空时不会再试另一查询；初始化之后OfficialTitles仍null也直接返回null。
6. 文化名空白、manager不存在、两次查找均无结果或CultureData为空，调用CreateProfile("NeutralFantasy")(0x886F80)。

分支证据分别为0x5CAB66—0x5CAB96、0x5CABA8—0x5CABB9、0x5CAC8A—0x5CACAB、0x5CABE7—0x5CAC5C、0x5CAC5D—0x5CAC85。初始化前非法mode怎样归一化仍由未展开的EnsureInitialized决定。

## 二、该profile中的称谓如何解析

officeId先Trim，null归空串（0x888E00—0x888E25）；language为空白时读取Language.GetCurrentLanguage，否则Trim（0x888E39—0x888E6E）。依以下顺序尝试，首个成功结果即返回：

| 顺序 | 来源 | 关键调用点 | 返回来源标记 |
| --- | --- | --- | --- |
| 1 | profile指定政体条目，例如Empire\|Leader | BuildEntryKey 0x888EEB、查询0x888F18 | PoliticalSystemOverride=0 |
| 2 | profile的Any\|officeId条目 | 构键0x8890AF—0x889145、查询0x889168 | CultureDefault=1 |
| 3 | 地图默认 | TryResolveMapDefault 0x8892D7 | 保留helper返回值 |
| 4 | profile.PresetId对应预设 | TryGetEntry 0x88930F | Preset=2 |
| 5 | NeutralFantasy预设 | TryGetEntry 0x8894D8 | NeutralPreset=3 |
| 6 | 内置兜底 | GetBuiltInFallback 0x889686 | BuiltInFallback=4 |

每一条目先EnsureInitialized；有gender时先GetTranslations(gender)，解析失败才尝试同条目的通用m_Translations(+0x18)。两者都失败才换下一个来源。因此“指定政体的通用称谓”优先于“Any层的女性称谓”，不能全局先找女性再找通用。首层指令证据0x888F7D—0x888FD1；Male=0、Female=1由元数据确认。

profile为null时直接尝试“地图默认→NeutralFantasy→内置兜底”，地图调用0x888EAD，失败转0x8894AD。ignorePoliticalSystemOverride=true只跳过第1层，仍执行Any、地图和预设；地图和预设helper仍收到原政体（分支0x888EF3→0x8890A8）。

CultureDefault标记实际意味着传入profile的Any条目，不足以判断profile是否来自国家自定义；UI必须另外保留国家binding来源。EnsureInitialized可能修改profile/entry，不将原函数称为无副作用的纯函数。结果的字符串字段null归空串；没有随机选择或直接修改国家绑定的分支。

定点字符串索引：Any@0x2E79D78（script.json行1097533）；分隔符|@0x2ED71A8（1156593）；NeutralFantasy@0x2EAAE08（1129633）。

## 三、一个语言字典中的精确查找顺序

TryResolveTranslations首先将out title清为空串。字典为null或Count=0直接false。其余按以下顺序寻找非空白值：

1. 请求language非空白时，用原language查字典；命中且值非空白即返回。
2. English键。
3. Chinese键。
4. 按Dictionary.Values的实际枚举顺序返回首个非空白值。
5. 均不可用则false，out仍为空串。

判空是String.IsNullOrWhiteSpace(0x165FF00)，不是只判null/空串。成功时返回原始值，不Trim称谓内容。本helper也不Trim请求语言、不读当前语言服务；那是外层职责。不存在本函数内专门的TraditionalChinese分支或大小写正规化；大小写由输入字典comparer决定。Values兜底不可排序，也不去重重复语言查找。有正常枚举器释放/异常清理，不吞异常。

依据：初始化0x88A8C6—0x88A8FC，请求语言0x88A902—0x88A941，English 0x88A967—0x88A99A，Chinese 0x88A9C2—0x88A9EF，Values 0x88AA14—0x88AAF9。字符串English@0x2E75578、Chinese@0x2EB9F78已核索引。具体泛型调用元数据为Dictionary<string,string>和ValueCollection<string,string>；不能拿共享IL2CPP地址上的其他泛型名称替代实际参数类型。

## 网页接入边界与尚缺证据

以上是三个函数的实际静态控制流恢复；没有声称已对原作运行时逐输入比对，更不是当前网页已具备完整官职编辑。当前47仍是civilization47-catalog.ts固定rulerTitle47及制度/信仰/自定义国名命令，未接官制来源表。

尚未闭合：TryResolveMapDefault内部，OfficialTitlePresets.TryGetEntry内部回退，GetTranslations(gender)，内置兜底、各EnsureInitialized与预设profile创建，以及编辑器ResolveScopeDetailed/ResolveWorkingTitle/ResolveInheritedTitle。保留明确接口，不用截图补猜其结果。网页默认中文需要提供实际中文数据，不能把原作English语言回退当成满足用户全中文要求。

接入任何新数据/命令之前先冻结现行b365886c0ed6418d6786a5701fc31db518190fe61c0bfad77c1effc8d33255de引擎；保留已冻结42a3/ce32和原存档，不能静默改日志engine。统一称谓解析将来应供当前领袖、候选、传位/复位与任次快照使用，改设置不重写历史titleAtAccession。本次不改规则指纹清单、版本保护、发布锁或任务完成状态。
