# 原作人物战力与伤害快照：限定只读核查

2026-10-08。仅静态读取用户授权的 `D:/steam/steamapps/common/FantasyMapSimulator` 安装包与已存在索引。未运行原作、未执行恢复脚本、未读取认证/SDK配置或个人存档。没有将完整包、dump 或私密资源放进 dist。以下不是实机或视觉等价验收。

GameAssembly.dll SHA256：`d42658a922155f6cc60295a64c02207e5eaa1d3a55fd5ed18dc8ecc562f9b82b`。

## 1. 海军人物特性

`Character.GetNavalCombatModifier` RVA `0x83C010`，`.pdata` 函数区间 `[0x83C010,0x83C131)`，289 字节 SHA256 `4a82a87328220111c916337c49c14a503896394f073445e63d718b82b4db357d`。

- `0x83C05E` 从 0 开始；`0x83C06A/6F` 读 Character.traits `+0x40`，空列表返回 0。
- `0x83C085/0x83C0BF` 建立枚举并 MoveNext；`0x83C0C8` Current，`0x83C0CD/0x83C0D0` 拒绝空成员。
- `0x83C0D2` 执行 `addss xmm6,[trait+0x48]`，`0x83C0E0` 继续枚举；`0x83C117` 返回。
- 所有特性按原顺序 float32 相加，重复照加，允许负值，没有 clamp、首项截断或技能乘数。本函数自身不检查年龄/存活，调用者决定是否读取当前存活领袖。

网页保留上述运算。已授权 `character-traits.json` 中省略的可选数值字段由网页加载器明确补 0；本批未恢复原 JSON 加载默认规则，不能把这一桥接称为原 getter 的行为。网页额外拒绝非有限输入。

## 2. 敌国加成缓存

已有 [上层战力恢复](../fms-terrain13-v5-2026-10-07/UPPER_EFFICIENCY_RECOVERY.md) 记录 `Army.CalculateLeadershipModifier` `0x345C20`、`State.UpdateLeaderCombatModifier` `0x5DE580`：领袖首个非零 combatModifierPerEnemy × 敌国数，float32，clamp 到 −0.5…0.5；不是全部特性的和。

本次补齐敌国来源与已核刷新入口：

- `State.GetEnemyStates` `0x5CACC0` 按 Unity frameCount 缓存（帧字段 `+0x1EC`，敌国集合 `+0x230`）。开关读取 WorldSettings 静态 `+0x98`。
- 旧 `WarManager.GetEnemyStates` `0x6792C0` 遍历 activeWarIds，己方在攻击集合 `+0x78` 则并入 defenderAllies `+0x70`；在防御集合 `+0x80` 则并入 aggressorAllies `+0x68`。跨战争 HashSet 去重。
- `WarCompatibilityServiceV2.GetEnemyStates` `0x67F770` 合并旧列表及 `AddV2Enemies(...,true)`；包括叛军。
- V2 `GetEnemyStateIds` `0x685560` 只读 ActiveWars 当前 Participants `+0x30` 的相反阵营，排除 Side.None=2；解析有效国家引用，没有按领土/城市/存活状态再筛选。
- `State.UpdateStateData` `0x5E0740` 起始刷新领袖战力。已核调用者为 `AdvanceOneMonth` `0x5BF120`（callsite `0x5BF1A2`，ValidateLeaderStatus 之后）与 `InitStateSimulationData` `0x5D02F0`（callsite `0x5D03AB`，家族初始化之前）。其他显式玩家命令调用者尚未确认，不能说不存在。

网页47只有统一 nativeWars，没有臆造第二套旧战争管理器。取所有未结束 campaign 的当前 `participants`，要求本国仍参与，收集对面并去重。`coalition.members` 保存退战/灭亡历史，不能并入当前敌国。创建后一次缓存及每30日事务入口缓存是明确网页调度映射，尤其人物建立后的初始刷新不冒充原作家族初始化前的调用顺序。

## 3. 野战/攻城伤害

| 字段 | offset | 构造默认 |
|---|---|---|
| State.SiegeDamageBoost | +0x358 | float32 1 |
| State.FieldCombatEfficiency | +0x35C | float32 1 |
| Army.damageToProvince | +0x90 | float32 10 |
| Army.damageToArmy | +0x94 | float32 40 |

State 构造 `0x5E2510` 的 `0x5E2EF4/0x5E2EFE`，及 `0x5E2F20` 的 `0x5E3915/0x5E391F` 写入默认值。Army 构造 `0x3529B0` 的 `0x352A7E/0x352A88` 写入 10/40。

`Army.Init` `0x34C720`（`0x34C9B9–C9C9`、`0x34C9D1–C9E1`）与 `CalBaseCombatEfficiency` `0x345B60`（`0x345B98–BA8`、`0x345BB0–BC0`）独立计算：

```
damageToArmy = f32(State.FieldCombatEfficiency * 40)
damageToProvince = f32(State.SiegeDamageBoost * 10)
```

不能再次乘相邻独立计算的 baseCombatEfficiency（State.BaseBattleEfficiencyBounus × 1.25）。

授权原目录 `FantasyMapSimulator_Data/StreamingAssets/Base/Traits/StateTraits/traits.json`（13项）SHA256 `bae443b9f9328be70a4006ff560792404a00e43846b637b4bf79ebbd8dfc20d0`：FieldCombatElite→FieldCombatEfficiency=1.5，SiegeCapture→SiegeDamageBoost=1.5。因此四种初始化结果为40/10、60/10、40/15、60/15。

- State.ApplyTraitEffect `0x5BFFA0` 于 `0x5C006E/0x5C0078` 重置这两项为1，再顺序重放 traits。
- Trait.ApplyEffect `0x528750` 经 `0x5288A7` 调 State.SetPropertyValue `0x5D86E0`；setter `0x5E4670/0x5E4520` 直接替换，没有相加、连乘或 clamp。
- AddTrait `0x5BEC3D` / RemoveTrait `0x5D6BCD` tail-call 重置重放。InitTrait `0x5D04F0` 在三个生成分支直接调用 Trait.ApplyEffect（`0x5D08B9/0x5D0AE9/0x5D0CB5`），初值来自构造。
- **纠正较早摘要的表述**：PostLoadSaveData `0x5D3B50` 的 `0x5D3ECC` 直接调用 Trait.ApplyEffect，并非执行 State.ApplyTraitEffect 的默认重置。
- ArmyManager.CreateArmy `0x359A00`（`0x359EED`）与 Army.Reorganization `0x34F9D0`（`0x34FAD3`）调用 Init，生成新快照。已核国家特性刷新尾部不遍历 Army 重写伤害。

## 4. 原作保存与网页保存不同

Army.Serialize `0x34FE00` 保存 baseCombatEfficiency（`0x3502E0` 读 `+0xA4`），但没有保存上述两项伤害。Deserialize `0x3463B0` 于 `0x346B9A` 调 CreateArmy→Init，根据那一刻 State 倍率生成伤害，之后不从JSON恢复这两项。Army.PostLoadSaveData `0x34DB00` 整理引用和单位，没有直接重写或调用 Init/CalBase。

原作整体加载时国家 traits 重放与 Army.Deserialize 的先后仍未恢复；不能承诺原作带特性的读档一定得到60/15。网页本批**选择保存两项伤害及初始化特性来源，以保证续算一致**，这是网页存档合同，不是原格式照抄。完整47存储入口尚未启用。

没有扩展到动态插件、自定义反射效果或全部间接写入；未证实 CalBase 的所有调用者。本批静态证据不代表完整战斗/动画/节奏/900日自主登陆通过。
