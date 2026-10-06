# 原作首都危机：限定静态证据

2026-10-06，只读GameAssembly.dll（SHA256 d42658a922155f6cc60295a64c02207e5eaa1d3a55fd5ed18dc8ecc562f9b82b）及既有IL2CPP索引。不是本轮网页已实现功能，不包含原始dump。主函数限定ComputeCollapsePressure/TryAnnexOutcome/TryCivilWarOutcome；少量直接短帮助函数用于核实常量和分母。

## 压力计算

ComputeCollapsePressure(0x664780,528B)：clamp01(.30×领土损失+.15×伤亡压力+.15×兵力劣势+.10×经济压力+.15×clamp01((100-天命)/100)+.15×家族分裂因素+政体修正)。王国/帝国+.10，联邦/共和国-.05，部落/神权0。

- TerritoryLossRatio(0x666C00)：战初InitialProvinceCountByState与当前state.provinces.Count的损失比例；初始缺失/非正返回0。
- CasualtyStress(0x68C900)：己方阵营死亡Ds、敌阵营De，D=Ds+De；D非正返回0，否则clamp01((Ds/D-.5)×3)×clamp01(D/2000)。
- StrengthStress(0x68E2D0)：双方兵力总和非正返回0，否则clamp01((.5-Ss/(Ss+Se))×2)。SideDeaths/SideStrength内部聚合仍未恢复。
- EconomyStress(0x68CBE0)：clamp01(.5×deficit+.5×reserveGap)。月收入正数时deficit=clamp01((军费-月收入)/月收入)，否则军费正数取1、非正取0。reserveGap=clamp01(1-gold/(6×max(1,月收入)))。
- FamilySplitFactor(0x664B70)：无执政家族取0；仅累加非执政、有省份、与执政家族关系<0的家族，贡献clamp01(影响力/400)×clamp01(-关系/100)，和再clamp01。CalculateFamilyRelation内部算法未知。

## 吞并资格与概率

TryAnnexOutcome(0x666D00,1664B)依次要求：国家是PrimaryDefender；有类型3 Annex且目标为该国的战争目标；存在战初首都省；目标受益人属于本战争一个阵营，战初首都当前占领方属于同阵营；初始陆地省>0，当前陆地省≤初始×.70；所有参战国均非isControlledByPlayer且非isRTSMode；World.isAllowAutoDiplomacy开启；该国没有活动内战。随后独立掷骰Random.value<clamp01(.35+.45×pressure)。

70%分母InitialLandCount(0x6654E0)读取InitialOwnerByProvinceId并检查实际province.isLand，不能混同压力里的初始全部省数。HasPlayerParticipant(0x665190)检查任何参战国。成功后日志+EndWar(war.Id,CapitalFallAnnexation=9)，领土实际转移在尚未展开的EndWar链。

Resolve外层先以clamp(.15+.85×pressure,0,.85)判重大危机，因此完整吞并路径概率是两次判定的乘积；所有资格成立且pressure在0—1时上限68%。这是控制流推导，不是原作UI文字。

## 家族内战与历史事件

TryCivilWarOutcome(0x667380,992B)：陆地省少于3或已有活动内战直接false；否则调用FamilyManager.TriggerCapitalFallCivilWar(0x8706E0)。返回叛国后创建携母国ID、叛国ID、叛国执政家族姓氏、当前时间的CapitalFallCivilWarEvent，并登记国家历史、全局HistoryManager和战争日志。

TriggerCapitalFallCivilWar内部未恢复；家族资格、天命阈值、实际切省、国名/国色、部队继承、宣战写入均不能由空返回说明猜测。下一批真实吞并与分裂还需EndWar特定结算和家族写入链，不用随机灭国/切省替代。旧v1—v8规则不改，新规则进入独立版本。
