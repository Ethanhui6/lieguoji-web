# 下一切片：原金币月结的只读恢复

2026-10-07。原安装目录只读，未运行原程序。GameAssembly.dll SHA256 `d42658a922155f6cc60295a64c02207e5eaa1d3a55fd5ed18dc8ecc562f9b82b`。本文件是下一批函数依据；v14 当前国库输入仍为1，没有财政生产调用者。

## 状态与顺序

`State.UpdateEcnomic`（原拼法）RVA **0x5DDCE0**：`gold +0x1D4` 为可负int；`goldBattleEfficiencyBounus +0x1D8` 为float缓存且JsonIgnore；`goldPerMonth +0x1DC` 是入账收入而非净收入；`armyCostGold +0x2B8` 是本次军费。字段见本地dump.cs 8669/8729。

构造函数0x5E2510/0x5E2F20仅在0x5E2ABD/0x5E34DE写缓存1f，其他上述int初值为CLR零。普通初始化0x5D02F0→0x5D03AB UpdateStateData(0x5E0650)→0x5E0C87 UpdateEcnomic；结账先于DetermineStateReligion、InitTrait、RandomDestiny(true)。不能以选完网页国运再发固定初始金币冒称原初始化。

原月更新0x5BF120：ValidateLeaderStatus →0x5BF1A2 UpdateStateData/Ecnomic→UpdateArmy→UpdateDiplomacy→0x5BF29A UpdateDestinyValue。月收入使用衰减前国运。起义0x45C160在0x45DC78–0x45DC8A单独给新国家Range(10000,23000)，不是普通国家初始化。

## 已闭合的有限输入月结

以下 `f` 每步为float32，`R` 为中点取偶RoundToInt（0x37AC80），所有整数乘加为int32：

1. 按国家省列表顺序汇总各省GetEcnomicPerMonth的int返回值。
2. 领袖税务倍率默认1；有效且存活leaderId>0时为f(1+GetTaxEfficiencyModifier())。
3. 取中央官职收入倍率；I=R(f(f(f(sum)*leaderTax)*central))。
4. 按结账前金币G和I求库存折减factor，见下。
5. credited=R(f(f(I)*factor))；gold=int32(gold+credited)。
6. 若gold<0且abs(f(gold))>f(int32(15*credited))，则gold=int32(-15*credited)。
7. goldPerMonth=credited。
8. 用此时尚未扣军费的gold、政体goldProductionModifier和ethnic计算并写金币战斗缓存。
9. gold=int32(gold-armyCostGold)。扣军费后不再次截断债务或刷新缓存。

例如100初金、收入100、军费500：缓存按正200计算，最终余额-300；负余额不会立即改变已经写入的缓存。

库存折减中的比值是有符号**整数除法**，不能改成平滑浮点曲线：

```text
factor=1
if G>int32(5*I) && G>20000:
  if G<=int32(15*I):
    t=clamp01(f(trunc(int32(G-int32(5*I))/int32(10*I))))
    factor=f(1+f(t*f(-.9)))
  else if G<=int32(25*I) && G>30000:
    t=clamp01(f(trunc(int32(G-int32(15*I))/int32(10*I))))
    factor=f(f(.1)+f(t*f(-.05)))
  else if G>int32(25*I) && G>30000:
    factor=f(.05)
```

RVA：汇总0x5DDE70–9C；倍率/取整0x5DDEF2–5DDF55；折减0x5DE2AB–38C；入账/债务0x5DE391–3DE；缓存0x5DE3E4–4EA；军费0x5DE4F2–4FE。零除/溢出之外的异常输入不纳入已验证正常合同，不能默默造数。

## 原军费

谓词0x727480仅接受ArmyState.Attacking=1或Reorganization=5（dump.cs3529）。位置来自army.currentCell→Province，费用区间0x5DE090–258：

- 本国省、距离d<=4：0；d>4：trunc(int32(d*min(d,12))/2)。
- 外国陆省：按原neighbors顺序找第一个本国省，其非零ID存在时收int32(distance*60)，否则0。
- 外国非陆省：420。

不读取兵员数、兵种、armyMaintenanceCost或粮食。原重编完成的一次费用与此月费分开，见先前REORGANIZATION_FOLLOWUP.md。网页状态及道路/海运位置映射尚未闭合，不把所有活军都收费。

## 省收入函数

`Province.GetEcnomicPerMonth` RVA0x454070，依赖population(+E0)、maxPopulation(+E4)、cells.Count、BiomeResource的BaseValue/Probability/AffectedBy、ethnic、destiny、国家/全图省数、地方官职收入倍率。资源字段dump.cs5244。

```text
base=R(f(f(pop)*f(.001)))
resourceSum=0
foreach resource:
  value=f(f(BaseValue)*Probability)
  if AffectedBy contains ethnic: value=f(value*f(1.2))
  utilization=clamp01(f(f(pop)/f(maxPop)))
  resourceSum=int32(resourceSum+R(f(f(utilization*f(.5))*value)))
density=clamp(f(f(f(pop)/f(cellCount))/100),.5,2)
resourceIncome=R(f(f(resourceSum)*density))
destinyFactor=f(1-f(f(f(100-destiny)/100)/3))
income=R(f(f(int32(base+resourceIncome))*destinyFactor))
sizeFactor = nationCount>=10 ? f(1-f(clamp01(f(nationCount/worldCount))*f(.5))) : 1
income=R(f(f(income)*sizeFactor))
return R(f(f(income)*localIncomeMultiplier))
```

原资源初始化0x456650，由InitSimulationData的0x458116调用，人口/容量/资源生成仍待下一项只读核实。现有网页粮食、人口或面积不能未经合同直接等同这些原字段。中央收入0x723210由Chancellor/Steward适合度与profile之和夹[-.12,.12]再+1；地方0x7237C0，真实人物官职尚未接入。

政体taxEfficiency/goldProductionModifier没有直接乘入上述月收入，后者只在金币战斗缓存中使用。ApplyTraitEffect/SetPoliticalSystem刷新属性，不即时刷新金币缓存。

## 存档边界与下一步

PostLoadSaveData0x5D3B50本身不调用Ecnomic，而缓存为JsonIgnore；原完整加载后首次缓存刷新时机未闭合。网页可显式持久保存自己的缓存，但加载不得再次初始化并发收入，不能冒称原加载行为一致。

下一批先实现独立纯月结及取偶/整数分段/缓存顺序回归，再闭合省资源初始化和网页军费位置映射，最后建立独立版本接线。v14试玩、旧版本和粮食账保持原合同。
