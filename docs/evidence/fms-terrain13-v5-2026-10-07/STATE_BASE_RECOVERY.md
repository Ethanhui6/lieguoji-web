# 原作国家特性与基础战力输入

2026-10-07，只读限定恢复。DLL指纹同 RECOVERY.md：d42658a922155f6cc60295a64c02207e5eaa1d3a55fd5ed18dc8ecc562f9b82b。没有运行原作、恢复脚本、读取个人档或认证/SDK配置。本合同尚未接入已试玩 v13；下一独立规则版使用，不能修改原 v13 指纹后继续读写同库。

## 军队基础效率的快照语义

`Army.CalBaseCombatEfficiency` RVA 0x345B60，0x345B80—345B90 写 `f32(state.BaseBattleEfficiencyBounus * 1.25)`。`Army.Init` 0x34C720 在 0x34C9A1—34C9B1 内联同式。构造函数 0x3529B0 则先写 1（0x352A92）。

- ArmyManager.CreateArmy 0x359A00，callsite 0x359EED 调 Init。
- Army.Reorganization 0x34F9D0，callsite 0x34FAD3 调 Init，重算基础效率。
- Army.Deserialize 0x3463B0，0x346FA9—346FC4 直接恢复 JSON `baseCombatEfficiency` float。
- PostLoadSaveData 0x34DB00—34DD75 整理引用和单位，不重算该字段。
- RecalCombatEfficiency 0x34E5B0 在 0x34E679 读取军队已存值，不现场用国家倍率替换。

直接 call/jmp 搜索未找到 CalBaseCombatEfficiency 调用者；可证明路径是 Init 内联副本，不能由此否定动态调用。CalBaseCombatEfficiency 同时更新 damageToArmy=40×FieldCombatEfficiency、damageToProvince=10×SiegeDamageBoost 与速度，均不再乘入 baseCombatEfficiency。本次不扩展伤害合同。

## 国家特性按顺序直接覆盖

State.ApplyTraitEffect 0x5BFFA0：三个布尔字段 IsWellTrained、IsHomelandDefense、IsConqueror 先 false（0x5C0007）；CoreDefenseEfficiencyBoost 先 f32(1.15)（0x5C0022，0x3F933333）；BaseBattleEfficiencyBounus 先 1（0x5C0035）。随后按 traits 次序调用 Trait.ApplyEffect（0x5C00D0—5C00FA）。

Trait.ApplyEffect 0x528750 按 effects 次序取 `key/isBool/value`，bool 为 value != 0，float 为 f32(value)，调用 State.SetPropertyValue 0x5D86E0。setter 直接覆盖；重复字段后写覆盖前写，不相加、不累乘、不夹值。ApplyTraitEffect 尾部刷新政体属性，但不遍历军队重算基础效率。

原加载器 TraitManager.LoadTraitsFromJson 0x527F70（0x527FEF—528076）经 World.GetStreamingPath、File.ReadAllText、JsonUtility 读取 `Base/Traits/StateTraits/traits.json`。授权安装目录该文件 SHA256：`bae443b9f9328be70a4006ff560792404a00e43846b637b4bf79ebbd8dfc20d0`。

| trait | effect key | 值 |
|---|---|---|
| WellTrained | IsWellTrained | bool true |
| CoreDefense | CoreDefenseEfficiencyBoost | float 1.5 |
| HomelandDefense | IsHomelandDefense | bool true |
| Conqueror | IsConqueror | bool true |

CoreDefense 是将默认 1.15 替换为 1.5，而非两者相乘。13 个基准特性都不含 BaseBattleEfficiencyBounus，因此基准新建/重整军队为1.25，不能据此覆写从存档恢复的已有基础值。WellTrained 原中文描述范围大于实际代码；已恢复主函数仅跳过核心倍率倒数，仍应用省通用防御和兵种地貌，不能实现成所有地貌惩罚免疫。

刷新入口：AddTrait 0x5BEBA0→0x5BEC3D；RemoveTrait 0x5D6B30→0x5D6BCD；StateInfoUI.OnEnableAllTraitsButtonClicked 0x4D3630→0x4D379C；State.PostLoadSaveData 0x5D3B50→0x5D3ECC；InitTrait 0x5D04F0 生成分支。军队保存的基础值与国家即时 bool/core 值属于不同刷新链，后者变动不可偷偷改写前者。

网页当前 Nation/Army 不具备上述原字段。后续应显式建模原特性投影和军队基础效率快照，不把 morale/supplies/fort 改名代替。核心距离规则、完整人物/官职与资金等仍需各自合同；相关静态工作继续，不据此标记原作完整战斗已恢复。
