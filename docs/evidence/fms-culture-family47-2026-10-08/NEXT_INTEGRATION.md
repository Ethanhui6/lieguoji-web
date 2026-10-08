# 下一接线点：真实政体进入首次财政与征募

只读源码定位，尚未实现；不要把此索引当作验收。接本批实际创建器，不能调用旧creator再覆盖姓名/文化。

1. **政体运行态先于首账。** 当前没有独立statePolitics；实际字段是`upperCombat.nations[id].polity`。先用civilization中的已选政体预填每国NationCombat与真实省份地形数据，再调用`upper14-state.reconcileCore`。这样跳过该函数针对缺失国家的随机政体兜底。新owner强制运行态政体与身份账一致；制度修改也须同事务同步。
2. **人口与资源→征募一次→首账。** `settlement25-fiscal.initializeFiscal`的前半段示范了`buildProvinceCells`、`nativeInitialPopulation`、`nativeInitialResources`；不能整段复用，因为后半段重定军额、扣人口、改征募事件并立即结账。47创建器已有statecraft且零军队，不能重复initializeManagement。初始征募复用`muster21-rules.regularMuster21(initial=true)`的真实兵源/安全省份/唯一ID/上限规则，但缩小输入接口，不能伪造旧run版本或未存在的国运对象。军队实际创建后再reconcileUpper和Army47空间/接触/时钟初始化。
3. **新经济输入，不伪装旧六文化。** 旧`restoration19-state.reconcileFiscal`固定调用旧`nationEthnic`，不能作为新文化入口。47当前没有经济方式，应建立单独持久字段及selector。原财政核支持`Other`，也可采用玩家明确选择的经济方式或已记账的网页生成规则；不要从宗教推断经济，也不要把真实文化偷换为EasternFantasy等ID。
4. **复用已经核实的公式。** `native-economy/settlement.nativeProvinceIncome` / `nativeGoldSettlement`、`court16-people.courtIncome`、`native-combat/upper-efficiency.defaultPoliticalCombat`可直接复用。首账原网页合同只为缺失账户创建一次，首次destiny=0，之后再按真实国运输入。旧月结军费位置按旧route/progress，必须替换成Army47实际位置，不能直接认定兼容。

该批最小验证：同地形与人口切换Republic/Tribal时，首账结果符合所选政体公式；重复初始化不再发钱、征募或扣人口；所有财政来源可由实际人物、独立经济方式与政体解释，缺输入拒绝；旧46冻结不动。

这些工作接回同一个待启用完整47，随后仍需死亡/任职、起义分裂/复国、完整日结、Store49、Worker和创建UI。不是另造演示，也不是只接一个表单就开放47存档。
