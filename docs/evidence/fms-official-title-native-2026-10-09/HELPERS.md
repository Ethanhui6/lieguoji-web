# 原作官职称谓：地图、预设和性别字典

2026-10-09。接续[三个外层函数](RESOLVER.md)，本批每个只读分析者只解码一个helper，root唯一写入；不运行原作或测试，不改当前52c5626浏览器候选。原DLL与metadata身份沿用本批已重新核对的完整摘要。以下均是静态指令与元数据调用点依据，不是逐输入原作运行时对照，也不代表网页界面接线完成。

| 函数 | .pdata序号（0基） | RVA半开区间 | 文件偏移半开区间 | 字节数 | 方法SHA256 |
| --- | ---: | --- | --- | ---: | --- |
| TryResolveMapDefault | 38006 | [0x88A2C0,0x88A80E) | [0x8888C0,0x888E0E) | 1358 | 09b1a27a7666ce25e0b86e7f2c4e1acd2c8a7ce18e178f624666a22611f47995 |
| OfficialTitlePresets.TryGetEntry | 37980 | [0x887700,0x8878D4) | [0x885D00,0x885ED4) | 468 | 28c2e45d92020dfa2e32f4bf444593235cb5c8d658b051ea1b30ddc0dcc6b779 |
| OfficialTitleEntry.GetTranslations | 37957 | [0x885DE0,0x885E61) | [0x8843E0,0x884461) | 129 | 3d230f0c1a072f06b35b60bf84f96e4e1873cd5ff0acf417e3beb1f0d946805c |

分别由character_integration_map、damage_snapshot47_audit、title_gender_contract只读分析。原始指令和完整dump不入仓库。

## 地图默认：只做两层查找，不递归完整解析

TryResolveMapDefault先将out resolution置null（0x88A345—0x88A35F）。依次调用World.get_Instance(0x6CC2E0，调用点0x88A38D)和World.GetMapDefaultOfficialTitleProfile(0x6B65F0，调用点0x88A3A0)，任一返回null即false。

1. Nullable<PoliticalSystem>有值时（0x88A3B1—0x88A3C6），用BuildEntryKey构造指定政体键（调用点0x88A3D3），在地图profile.Entries(+0x20)查询。条目存在且非null时先EnsureInitialized，再按性别字典→通用字典调用已恢复的TryResolveTranslations。成功立即返回，不再查Any。
2. 政体无值、key缺失、条目null或两种字典均无可用文本时，查Any|trimmedOfficeId；officeId为null归空串。构键0x88A59D—0x88A63A，查询0x88A63F—0x88A65D，按性别→通用解析0x88A6C2—0x88A71D。
3. 两层均失败返回false，out仍null。成功才构造resolution，其title为解析文本、sourceKind=MapDefault(5)、sourcePresetId为空串、sourceEntryKey为实际命中键。两处来源标记写入在0x88A535和0x88A79C。

本helper没有读取profile.PresetId(+0x18)，没有调用TryGetEntry、NeutralFantasy或内置兜底；也没有调用ResolveDetailed/ResolveScopeDetailed/自身。没有深度计数或profile相等防护，它通过仅查两层而避免递归。网页不能将此helper替换成resolveDetailed(mapProfile)，否则会引入原函数不存在的再次地图回退与地图预设查找。

世界getter的内部创建/初始化/存储行为本批未展开；helper自身不调用profile.EnsureInitialized。若getter给出非null profile但Entries为null，会进入0x88A808异常路径，不是正常“没有条目”的false。语言原样交TryResolveTranslations，不在这里Trim或读当前语言。此helper调用图已闭合，但不将未读getter说成完全无副作用。

UnwindInfo=0x2C84264。实际含填充读取窗口[0x88A2C0,0x88A810)为1360字节，SHA256=64fa0d8140f52f057d56492fdb9c96aca3d0052f9b4129d5498aff01a5d5bde8。入口dump.cs88104—88105；世界getter签名62786—62787/62804—62805。

## 预设条目：key命中和文本可用是不同条件

TryGetEntry(presetId, polity, officeId, out entry)先清空out，调用NormalizePresetId(0x887480，调用点0x887782)，用其返回值查静态s_Presets。外层字典缺key才返回false。NormalizePresetId未展开，不能假定原输入未知/空白ID直接失败。

命中预设后，调用BuildEntryKey(polity,原officeId)(0x887B00，调用点0x8877C5)，查该预设的指定政体key。TryGetValue为true即直接返回true（0x8877E5—0x8877EC→0x8878B8），不检查entry是否null，也不检查语言、性别或标题空白。

仅指定政体key不存在时，构造Any|(_officeId?.Trim()??String.Empty)，查同一个预设并原样返回查询bool。Trim调用点0x887863，Concat为0x88788E，最终查询为0x8878AA。空officeId在此支路得到Any|，没有额外拒绝。

因此：一个政体专属条目存在但没有可用翻译时，此helper仍返回它，不为语言失败再取同一预设的Any；后续由外层Resolver继续下一来源。不要套用地图helper的“文本失败后Any”逻辑。签名本身没有语言/性别参数，本方法也不读entry的三个语言字段或调用EnsureInitialized。

静态预设字典为空引用，或命中外层key但内层字典为空引用时，转0x8878CE调用未展开运行时helper0x233680后接int3；不能改写成普通未命中，也不凭地址指定异常类型。

调用点泛型元数据已核：外层Dictionary<string,Dictionary<string,OfficialTitleEntry>>.TryGetValue槽0x2E82F88（script.json1266567），内层Dictionary<string,OfficialTitleEntry>.TryGetValue槽0x2E978D0（1294152）。静态类型槽0x2E8F8E8、s_Presets静态偏移0。Any@0x2E79D78、分隔符|@0x2ED71A8。

未恢复NormalizePresetId、BuildEntryKey、字典comparer和.cctor/CreatePresets/CreateEntryDictionary；不能声称已有全部预设中文数据或具体政体编码规则。UnwindInfo=0x2C37D3C，version1/flags0，无链式片段。下一方法从0x8878E0开始，填充不计入方法哈希。

## 性别字典：直接选择字段，回退由上层处理

GetTranslations(Nullable<Gender>)行为为：

| 正常nullable输入 | 返回字段 | 返回指令RVA |
| --- | --- | --- |
| HasValue=false | m_Translations(+0x18) | 0x885E34 |
| Male=0 | m_MaleTranslations(+0x20) | 0x885E52 |
| Female=1 | m_FemaleTranslations(+0x28) | 0x885E43 |
| 其他整数（含负数） | m_Translations(+0x18) | 0x885E34 |

它不调用EnsureInitialized、不创建字典、不查Count/内容；允许返回字段null。性别字典缺值后再试通用，是上层ResolveDetailed/TryResolveMapDefault的行为，不属于本getter。

0x885E21—0x885E28组合判断HasValue和Male，0x885E2A—0x885E32判断Female，其余直接返回通用字段。开头0x885E05和0x885E11的两次call 0x2334A0是受一次性标记保护的元数据准备：传入槽0x2EA77A8对应Nullable<Gender>.GetValueOrDefault，0x2EA7880对应get_HasValue（script.json1316032—1316034、1316102—1316104）。不是调用前一方法EnsureInitialized(0x885D60)。运行时元数据准备helper内部未展开，不据此声称零副作用。

正常控制流分析以合法.NET nullable布局为前提。机器代码检测BL&1，不把非规范布尔原始字节当作受支持输入。UnwindInfo=0x2C4A92C，version1/flags0，无链式片段；下一方法0x885E70前的填充未计入129字节摘要。

## 接入状态

外层三函数加本批三helper共六项已经有具体静态合同。仍需保持getter/初始化器、key正规化、预设数据与内置兜底的未知边界。当前只保留来源，不把未接入的官制设置显示成可用按钮；不变更当前游戏引擎或已有存档。先完成当前试玩候选整套验收及有界预览，再按既有WEB-03-06接入，且先冻结现行b365引擎。
