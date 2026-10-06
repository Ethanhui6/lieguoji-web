# 人物与实际任职查询：只读恢复合同

2026-10-07，根唯一写入，两个代理按每批至多3函数只读原DLL及既有dump索引。未运行原作/恢复脚本。原DLL SHA256 d42658a922155f6cc60295a64c02207e5eaa1d3a55fd5ed18dc8ecc562f9b82b。以下函数证据不是原作实机或用户视觉验收。

## 任职查询

- State.GetGovernmentOfficeAssignment 5CB0A0：先5CB155→Ensure5C64D0；5CB1DD读取+2D8列表；5CB21A FirstOrDefault保持列表顺序。谓词727DB0跳过null，再727DE2→Matches879A50。
- EnsureGovernmentOfficeData 5C64D0：列表null建立空表；+2E8 normalized为真直接返回。否则逐非空记录，5C66A8→Normalize879AC0，5C66AD写WarSystemKind+28；5C6705标true。不删项、不去重、不排序、不增+2EC版本。
- Matches879A50：879A6F传StringComparison.Ordinal=4，879A75调用String.Equals；大小写/空白精确，null与null可相等。879A7E比ScopeKind+20，879A83比ScopeId+24；879A8E–94仅规范化查询war后与存储+28相等。不规范化存储侧。
- Normalize879AC0–C8：scope==War(2)保留war原整数（包括未知值）；其他scope返回0。
- GetHolder883010：选择第一匹配任职后，按HolderCharacterId+18查询人物。人物不存在/不存活/不属于state.i返回null；不会为失效的首项继续找第二个重复任职。ID0没有被排除。

## 四能力与特性

- 军事83BEE0：traits+40，每项militaryModifier+28，83BFA2 addss。
- 外交83BDB0：trait+2C，83BE72 addss；getter83E020读取base+38，83E030调用修正，83E035 addss后夹0..100。
- 魅力83BB60：trait+24，83BC22 addss；getter83DFD0读取base+30，83DFE0调用修正，83DFE5 addss后夹0..100。
- 行政83B880/83DF70与税赋83C330见NEXT_RECOVERY。所有sum保持列表顺序、重复项，每次f32舍入；null列表0、null元素异常。未加入年龄/官职/存活倍率。原NaN可能保留，网页有限值校验是适配边界。
- GenerateInitialAttributes8391A0：四次float Range(20,80)，顺序魅力8391D6→军事83921B→外交839242→行政839269，各夹0..100再写基础字段；839292 int Range(1,4)，8392B7 GetRandomCharacterTraits5270D0并整体覆盖traits。四次随机独立，不得把基础值都设50。Unity floatRange包含端点；int上界排除。
- GenerateInitialTraits8392F0：83930A int Range(1,4)，839325调用同选择器，839333整体替换traits。不能仅凭请求1..3证明一定返回1..3。
- Character ctor83DDA0设四基础50、新空traits/children/roles/pastRoles、姓为空、alive=true；它不写年龄/ID/出生。带参CreateCharacter8385C0先无参838760，再姓名/性别/文化，再重复四能力及traits初始化。最终人物创建必须继续确认无参链，不能使用构造器50当最终数值。

任期结束不是死亡。旧chronicle记录的王号/任次、历史快照不能改为新人物生命周期。生产接线需独立版本冻结、人物持久表、真实任职与财政输入、Worker及保存恢复证据；本文件不宣称已接线。
