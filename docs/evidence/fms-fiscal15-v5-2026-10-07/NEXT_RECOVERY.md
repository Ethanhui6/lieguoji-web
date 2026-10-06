# 下一切片已取得的原作证据（没有生产接线）

只读代理在本批验证期间追加检查3个函数，不写源码、不运行原作。本记录避免下一批重复恢复月结。当前v15仍按CONTRACT中的Other/人物中性输入运行；不能将下述记录写成已完成功能。

## 五族群

State.ethnicAttribute +D8，原枚举0..4依次 FishAndHunting、Agriculture、Nomadic、Maritime、Commercial，没有Other。复用已恢复InitTrait 0x5D04F0：无文化fallback均匀整数0..4（写点5D07AE/5D09E0/5D0BB3）；有文化走MapCulture.GenerateStateProperties 3D2DA0→GenerateEthnicAttribute 3D2640、3D2E35写回。裸构造0与RandomInit后一次生成须区分；确定性网页种子不能称Unity全局序列等价。

## 人物税务特质

Character.GetTaxEfficiencyModifier RVA83C330，traits+40；按原列表顺序float32累加每项CharacterTrait.taxEfficiencyModifier+34，无clamp、平均或去重。83C38A检查列表，83C3F2 addss。财政已有有效存活leaderId>0时用f(1+sum)，否则1。

安装目录 StreamingAssets/Base/Traits/CharacterTraits/character_traits.json SHA256 80364fe01c1759782e6dad8d9c52eeb44f7963fd88f53fb6f23b2f74157fb797。五个非零：Genius天才+.1；Administrator行政天才+.15；Just公正+.05；Incompetent无能−.1；Greedy贪婪+.1。对应中文同目录localization.csv SHA256 bd96a9a8fdc593f1241a35447842022982d053b3528b325d563e6f7e105f0591。原国家StateTraits13项没有财政键，不要把国家特性当人物税务特质。

## 地方/中央官职收入组合

f为float32，s为normalized suitability，cap为GovernmentOfficeEffectProfile.EconomicModifierCap+10。

- GetCentralIncomeMultiplier 723210：Chancellor、Steward都scope State=0，scopeId State.i。`f(clamp(f(f(sSteward*capSteward)+f(capChancellor*sChancellor)),-.12,.12)+1)`；72331A/723355取适合度，723374–72339F组合；无国家直接1。
- GetLocalIncomeMultiplier 7237C0：Governor为Province=1、省i；DistrictGovernor为District=3、districtID，<=0时s=0。各项先`f(1+f(s*cap))`，再`f(clamp(f(f(district*governor)-1),-.12,.12)+1)`。7238DE/723989查询，7239A8–7239D7组合。地方不是两项相加；各5%时约10.25%，中央约10%。

尚缺四官职cap真实常量：元数据指向GovernmentOfficeDefinitionCatalog.s_Definitions / .cctor RVA87EF40。本轮未展开第四函数。任职者解析与归一化适合度为GetNormalizedOfficeSuitability RVA723F90，其后skill计算未闭合。不得用网页稳定度、国家特性或政体taxEfficiency代替。

下一批应先为目前已试玩v15冻结执行链，再接一次持久化五族群和明确人物特质输入；完整人物生成、任命/存活、文化加权与官职实际来源必须分别落证据。不得偷偷改变v15金币缓存或旧档。

## 后续两个只读批次已闭合的官职输入

同一原DLL，3函数/批，没有生产改动或原作运行。

GovernmentOfficeDefinitionCatalog.cctor 0x87EF40：AiProfile权重字段A/M/D/C为+10/+14/+18/+1C；EffectProfile.EconomicModifierCap+10。四表如下（全部常量按f32）：

| Office | Scope | cap | A/M/D/C权重 | cap写点 |
|---|---|---:|---|---|
| Chancellor | State=0 | .06 | .45/.05/.30/.20 | 87F0FA，bits3D75C28F |
| Steward | State=0 | .08 | .65/.05/.15/.15 | 87F1DF，bits3DA3D70A |
| Governor | Province=1 | .08 | .50/.10/.20/.20 | 87F3A2，bits3DA3D70A |
| DistrictGovernor | District=3 | .05 | .45/.10/.25/.20 | 87F491，bits3D4CCCCD |

GetNormalizedOfficeSuitability 723F90：723FB3调用GetHolder(883010)，warSystemKind=None=0。无holder、已死+68、无state、holder.stateId+70不等于State.i+24都返回0，不是技能0产生−1。有效时，逐项f32乘算，再按`score=f(f(f(M*wM+A*wA)+D*wD)+C*wC)`，最后`clamp(f(f(score−50)/50),−1,1)`；7240C4/CF/DA为三次addss，7240EA–724118归一化。缺definition/AiProfile时score50。四技能均取实时getter，不用存储快照或国家稳定度。

GetHolder 883010：国家空返回null；883033→State.GetGovernmentOfficeAssignment(5CB0A0)转交office/scope/scopeId/warKind全部参数；取得assignment.HolderCharacterId+18；manager为空返回null；839520按ID查人物，人物不存在/已死/不同国返回null。此函数本体不删除记录、不另选人、不回退领袖，也没有holderId>0限制。下层GetGovernmentOfficeAssignment的匹配/重复/规范化/整理规则仍待恢复。

Character.GetAdministrativeModifiers 83B880只按traits+40原顺序累加administrativeModifier+30，83B942 addss；列表null为0，条目null走异常83B995，不跳过、不去重、不平均。get_AdministrativeSkill 83DF70以83DF85计算f(mod+baseAdmin+3C)，然后clamp0..100。原JSON Administrator20/Genius10/Incompetent−15/Greedy−5是能力点数，不是百分比。

get_MilitarySkill 83E330读取baseMilitary+34，83E340调用GetMilitaryModifiers83BEE0，83E345加法后夹0..100。此批没有假定MilitaryModifiers与行政相同。其余实时技能getter外交83E020、魅力83DFD0，原能力生成、任职生命周期、军略修正源仍待补。

可立即实现：四官职profile、已解析任职者有效性、已提供四最终技能→适合度、中央/地方组合、税务与行政特质顺序累加。实际人物/任职生成和生产来源未建前，只能称独立数值内核，不可称官职系统已经在游戏内生效。
