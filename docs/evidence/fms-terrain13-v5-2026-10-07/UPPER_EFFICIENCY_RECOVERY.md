# 下一切片：Army 上层效率静态恢复（尚未接入 v13）

2026-10-07，terrain_efficiency_recovery只读代理按根任务限定核查原PE/IL2CPP方法。原DLL SHA256同本目录RECOVERY：`d42658a922155f6cc60295a64c02207e5eaa1d3a55fd5ed18dc8ecc562f9b82b`。没有运行原作、恢复脚本或测试，不代表已试玩效果。**当前v13仍是原兵种地貌＋明确网页上层适配；下列合同待新规则版本接入，不修改已试玩存档指纹。**

## Army.RecalCombatEfficiency 0x34E5B0

正常有限输入，f表示每步float32。当前省来自 `world.cellData.Province[army.currentCell]`，不是目标省。令s=army.state，p=当前省。

1. `e=f(baseCombatEfficiency × max(f(.1),f(destiny/f(30))))`，再乘领导力。
2. 若 `leaderCombatModifier!=0`，`e=f(f(1+leaderCombatModifier)*e)`。
3. `core = p.state!=null && p.distanceFieldToCapital<=p.state.coreProvinceDistanceField ? p.state.CoreDefenseEfficiencyBoost : 1`。读的是当前省所属国，非进攻国。
4. `isAttacking = p.state !== s`（State引用比较）。profile为空时unit=1；否则 `unit=max(.05,GetUnitCombatModifier(unitKey,p,isAttacking))`。
5. 省通用防御 `province=p.GetCombatEfficiencyModifier()`。守方：若IsHomelandDefense先×1.5，再依次 `e=f(province*e)`、`e=f(e*core)`、`e=f(defenseModifier*e)`。攻方：若IsConqueror先×1.5，再 `e=f(f(1/province)*e)`，除非IsWellTrained否则 `e=f(f(1/core)*e)`，最后 `e=f(e*attackModifier)`。
6. 突出部 `protrusion=p.isProtruding?2:1`；若 `p.stateID===s.i`（此处数字ID比较），取倒数。`e=f(protrusion*e)`，再 `e=f(e*goldBattleEfficiencyBounus)`。
7. 夹 `.1..10` **以后** 再乘unit；isElite另乘10。不能把最终值夹10。上层20/unit2/elite时，结果200；上层下限.1/unit下限.05时可到.005。

RVA段：基础/国运/领导0x34E65B—6B0；领袖额外6B4—6CA；当前省6CD—777；核心77D—7A6；攻守/兵种7AA—808；防御82B—85D；攻击85F—8AB；突出部/资金/clamp8AF—90B；unit/elite90F—91A。

主函数**没有直接读取**士气、军粮或兵员；不因此宣称所有上游也完全没有士气。尾部分支World.IsDouyinMode且非玩家国乘.1（0x34E944—95F），但本DLL的该getter 0x321180为恒假 `xor al,al; ret`，此分支在本包不可达；不能按共享RVA别名误解释为海渡。

## 领导力与领袖特质是两路

CalculateLeadershipModifier包装0x345E90，内部0x345C20。战役来自 **targetProvinceObject.currentCampaign**，与主函数当前省取地形分开。

- 中央军：`clamp(f(1+f(f(officialSkill-50)/150)),.5,1.5)`。
- 非中央军且familyId<=0：同式分母300。
- familyId>0但FamilyManager.GetFamily为空：直接1。
- 家族存在、族长空/已死：官方技能、分母300。
- 活族长：先 `f(f(familySkill*familyWeight)+f(officialSkill*officialWeight))` 得混合技能，然后分母150的公式。
- 政体权重家族/官方：Kingdom0=.6/.4，Empire1=.2/.8，Federation2=.5/.5，Republic3=.5/.5，Tribal4=.8/.2，Theocracy5=.3/.7，其他=.5/.5。跳表0x345E78，分支0x345D67—DDA，乘加clamp0x345DDA—E16。

GovernmentOfficeEffects.GetMilitaryLeader 0x723CC0：若战役warId>=0查V1 WarCommander，否则v2WarId>=0查V2 WarCommander；再回退Marshal，再State.Leader。候选必须活着且character.stateId===state.i；V1候选无效不会再查V2。GetMilitaryLeadershipSkill 0x723EF0无人物默认50。

Character.MilitarySkill 0x83E330：`clamp(f(baseMilitarySkill+traitSum),0,100)`；GetMilitaryModifiers 0x83BEE0按traits顺序float32累加militaryModifier。

**另一条** State.UpdateLeaderCombatModifier 0x5DE580：先清零；要求leaderId>0、人物存在存活、traits非空，取按顺序**首个**非零combatModifierPerEnemy（不是求和），`clamp(f(f(GetEnemyStates().Count)*modifier),-.5,.5)`。主函数乘1+它。首项查找0x5DE6A3—6CA，敌数乘算clamp0x5DE717—74F。GetEnemyStates集合组成/刷新调度未展开，不得替换成当前一场战役参战国数量。

## Province 通用防御，不等于兵种加权表

ResetCombatEfficiency 0x45B200：候选地形=山3/高原1.5/普通1；统计本省全部cells的biome数量（此函数不去Marine），取dominant biome。严格`>`比较，并列保留字典枚举先遇项；空cells为0。

`candidate=max(地形候选,Biomes.CombatEfficiencyModifier[dominantBiome])`。未锁定存`clamp(candidate,1,3)`；锁定保留现有modifier仅夹1..10，前面统计仍执行。

13项原表（ID顺序同RECOVERY）：`[1,2.5,2.5,1.3,1,1,1,1.2,1.2,1,2,4,1.5]`。雪地表4最终自动夹3。Biomes..cctor 0x363F20的0x3648BD—8F1，用global-metadata.dat偏移0x640538处52字节初始化float[13]；52字节SHA256正好为PrivateImplementationDetails字段 `646C5DF26E10C202F0D5542DA16AE316476A161A5C60C5D7EBB3076B1F8F3072`（dump.cs:88701）。

GetCombatEfficiencyModifier 0x453D30：`!locked && isMannulSetFortress && isMannulFortreess` 返回3；否则返回stored夹1..10。不能把网页现有city.fort等级默认为这三个原字段。IsStateCore 0x460B20为省所属国非空且distanceFieldToCapital<=国coreProvinceDistanceField。

## 政体与资金输入

State.PoliticalSystemCombatAttackModifier 0x5D3720 / DefendModifier0x5D3740直接返回当前politicalSystemAttributes，不按政体现查默认表。GetDefaultForPoliticalSystem0x44CCB0默认 attack/defense/goldProductionModifier：

| 政体 | 攻 | 守 | 金产 |
|---|---:|---:|---:|
| Kingdom | 1 | 1.05 | 1 |
| Empire | 1.05 | 1 | 1 |
| Federation | 1 | 1 | 1.05 |
| Republic | 1 | 1 | 1.1 |
| Tribal | 1.05 | .95 | .9 |
| Theocracy | 1 | 1 | .95 |

这是默认值，非traits/ethnic后处理最终值。CalculateGoldBattleEfficiencyBounus0x5C0460：`base=gold>0?1.1:.9`；`clamp(f(f(goldProductionModifier*base)*ethnicFactor),.8,1.2)`，不是taxEfficiency。ethnic正金/非正金：FishAndHunting1.02/.98、Agriculture1.03/.97、Nomadic1.01/.99、Maritime1.04/.96、Commercial1.05/.95、其他1/1。字段读取0x5C048F—495；乘算0x5C0552—57C；gold==0走.9分支；主函数消费缓存。

## 下一步与限制

后续已完成限定静态恢复：baseCombatEfficiency赋值/刷新、CoreDefenseEfficiencyBoost与三个国家布尔特性见STATE_BASE_RECOVERY.md；核心距离与逐年阈值见CORE_DISTANCE_RECOVERY.md。政体traits/ethnic后处理、资金缓存刷新、GetEnemyStates与GetHolder内部细节仍未扩展。静态合同不等于v13已接入。

网页目前缺原人物/家族/官职/省核心模型。不能将morale、capital、city.fort换名就宣称等价。应先封存已可玩的v13，再用独立版本显式建模缺失输入/迁移副本，绑定全执行闭包并保留旧库。原异常引用导致异常，不存在“全部缺失都中性1”的原始合同；网页回退须说明。
