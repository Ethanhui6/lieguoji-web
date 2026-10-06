# 下一切片：原省人口与资源初始化

2026-10-07，只读指定安装包，未运行原作。DLL SHA256与GOLD_RECOVERY.md相同。本文闭合财政输入生成，不是v14已经替换人口或粮食的声明。

## 入口顺序

World.StartManager 0x6C4800→0x6C495E国家共享初始人口比例→0x6C49C9 ProvinceManager.Start(0x470D10)；后者先建立省国关系，再在0x470E18调用Province.Start(0x45C040)。省Start仅处理id!=0且!isLocked；陆省调用InitSimulationData，然后isLocked=true（+0x88准确为isLocked）。省完成后才进入国家Start/首次财政。

State.StartInitialPopulationPercentage(0x5D9AE0)为同国一次Range(.7f,.9f)，写+0x21C。两个构造函数0x5E2510/0x5E2F20的默认值.7f分别写在0x5E2B27/0x5E3548；世界启动统一随机化。

## 原地貌与默认设置

按原BIOME_NAMES的13个ID（包括Marine）依次：

```text
populationInitRange = [5,.5,.5,4,6,8,10,6,6,4,3,.5,5]
foodProductionEfficiency = [5,1,1,3,5,7,10,5,6,3,2,0,4]
populationInitPercellFactor = 100
foodProductionFactor = 10
populationGrowRate = 1.002f
```

容量52字节metadata偏移0x641128，SHA256 ccecb9131bb6e5f6c79b2e88b75e46f31f54a3a9716296191a39c5fe3c84d37e；Biomes..cctor的0x36482D–0x36484D，dump.cs88715。食物52字节偏移0x640630，SHA256 7b166e3145df16fd7a85890373cb6135aa205f1308bd610905880741add75e40；0x3647D8–0x3647FB，dump.cs88706。默认设置来自WorldSettings..cctor0x6E2240的0x6E23E7/0x6E23BD/0x6E23D2；实际函数应接收设置值，不将默认当不可修改。

## 人口生成有限输入合同

f为每步float32，trunc为向零取整。GetMaxPopulationInProvince(0x454E80)：

```text
sum=f(0)
for cell in original province.cells order:
  sum=f(sum+populationInitRange[cell.Biom])
computedMax=max(1,trunc(f(f(f(cellFactor)*sum)+f(5000))))
hadData=(oldMax>0 || oldPop>0)
maxPop = maxLocked && oldMax>0 ? oldMax : computedMax
pop = hadData ? clampInt(oldPop,0,maxPop)
              : trunc(f(f(f(maxPop)*f(statePercentage))*provinceRandom09To105))
```

逐cell相加0x45500C，乘因子加5000在0x45507B–87；InitSimulationData0x457B83–96转int。省级Range(.9f,1.05f)调用0x457BF7，顺序乘法0x457C03/07。同国共享比例与逐省比例不是一次独立随机。

随后InitSimulationData在0x458104调用UpdateProvinceData(0x45EB30)，再0x458116初始化资源。因此人口还经历：

```text
growth = provinceIsAtWar ? f(f(populationGrowRate)*f(.97)) : f(populationGrowRate)
pop=trunc(f(f(pop)*growth))
if pop>maxPop: pop=maxPop
else if f(f(maxPop)*f(.3))>f(pop): pop=trunc(f(f(maxPop)*f(.3)))
```

0x45ED84–C0与0x45EDF1–0x45EE37。oldPop=0但oldMax>0也会在此升到约30%。provinceIsAtWar来自CheckWarStatus0x4509B0检查本省敌军，不等于外交战争；初始无敌军驻省则常规增长。

## 资源数据与逐候选抽样

指定来源 `D:/steam/steamapps/common/FantasyMapSimulator/FantasyMapSimulator_Data/StreamingAssets/Base/BiomeResource/BiomeResource.json`，SHA256 **c6fe1e80f126358d058921ca17a96e0088164d15b1af283ff7285fcc70104445**。60资源，13份地貌分布。Biomes.Init0x362D30的路径字符串已闭合；原字段Name、BaseValue、AffectedBy，以及地貌Resources中的Name/Probability。

LoadBiomeResourcesFromJson0x363230按精确资源名连接；找不到则警告/跳过（0x3637AD–0x36380B），不抽随机、不补别名、不按地貌重新归一化。Probability读为float32。

InitBiomeResource0x456650：

1. 清空省资源。按biomeCounts枚举顺序，得到Biomes.name[id]→f(f(count)/f(cells.Count))，包括Marine。
2. GetBiomeResources0x362C90精确字典查找地貌名，无键则跳过。
3. 按每个有效候选原顺序调用一次Random.value。weight=f(ratio*f(candidateProbability))；仅random<weight选中，严格小于（0x456B6F–8C）。
4. 首选复制Name/BaseValue/AffectedBy列表，Probability=weight；重复同名Probability=f(old+weight)，BaseValue=max(old,new)，不合并/替换AffectedBy。
5. 沿海时再遍历一次Marine候选，weight=f(f(.3)*candidateProbability)。不按海岸长度，不因已有Marine贡献而取消。
6. 最终概率用double逐项求和，最后一次f32转换；每项归一化为f(probability/total)。Enumerable.Sum链0xC1A100→0x1B7E260，cvtss2sd/addsd在0x1B7E36F–373，cvtsd2ss在0x1B7E3E4。
7. 全部失败则空列表，无保底/重抽。

必须保留原包自身名称不匹配：ID3原代码`Savannah`而JSON为`Savanna`；ID6原代码`Temperate deciduous broadleaf forest`而JSON为`Temperate deciduous forest`，两地貌无陆地候选。Tundra/Snow引用`Fox Fur`但全局仅`Arctic Fox Fur`，加载即跳过该候选。JSON行254/337/369/415/422。沿海Marine额外抽样仍可发生。若修别名必须另记新规则，不能冒称同原作。

## 沿海判定

FilterProvinceCells0x489FE0闭包0x727900：每省先isSeaNeighbor=false，逐省cell的CellData.Neighbor检查；先跳过邻格省ID等于本省或0，再对其Height<20标true（0x727B0C–0x727B5E）。港口数量或视觉海岸相交不等于此值，未分省的0号邻格不能触发。

## 网页适配边界

现有world.ts137调用旧initializeStatecraft：面积乘plain2.5/forest2/other1.3的容量，固定70%人口、人口×20粮食。v14继续消费它，不冒称上面原人口。

下一版需要一份一致的、有顺序的cell地貌/数量/邻接/海岸输入桥，让容量、资源比例和人口密度共用。网页顶点与原Unity cell不等价。可用明确seed分流复现分布，但Unity全局随机状态和跨系统调用顺序未恢复；原初始化还穿插粮食随机。设置覆盖入口、完整省月度人口粮食与编辑后再初始化生命周期不属本次已闭合范围。
