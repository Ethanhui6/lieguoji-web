# 原作核心区距离与年度阈值

2026-10-07限定只读恢复，原DLL指纹同RECOVERY.md；未运行原作、脚本、读取个人存档或认证配置。尚未接入v13。

## 首都距离

State.FilterBorderProvince RVA 0x5C6D90 后半段，Province.distanceFieldToCapital 位于+0xEC。首都取 state.capitalBurgID → world.burgs[id].cell → CellData.Province[cell] → ProvinceManager.provinces[id]（0x5C74C7—75AC），不是国家中心或BurgData.province。

将首都省入visited/queue、距离0（0x5C75FD—7634），按queue当前长度分层（0x5C7640—7683）。遍历Province.neighbors（0x5C7691—770C），只接受next.state===state且未访问（0x5C775F—777C），写depth+1并入队（0x5C7782—77AB）。每层depth++（0x5C781A）。

BFS结束后按 **state.provinces原列表顺序** 写isConnectedToCapital。每个未访问省先depth++再赋距离（0x5C7822—78DC）。连通最远距离D时，第一个断连省得到D+2，随后D+3等；不是Infinity/统一哨兵。增删省使用List.Add/AddRange/Remove，本段没有排序。网页不能按ID排序后冒充相同断连编号。

Province.RecalculateNeighborProvince 0x45AC20：清空neighbors，遍历全部province.cells及World.GetNeighborCells(cell)，将CellData.Province[neighborCell]排除自身ID后加入HashSet。World.GetNeighborCells 0x6B6AC0直接返回CellData.Neighbor[cell]（+0x108）。无道路、航路、港口、距离、速度、河流惩罚。邻接重算本身可含海省，但Filter前段剔除国家省列表中!isLand、id===0、!isValid项并将其state/stateID归0（判断0x5C7006—701C、清理0x5C70C9—7153），因此正常图不会借海省跨海连接。BFS依赖此前清理，没有在每次访问重验陆海。

## 核心阈值

State.coreProvinceDistanceField +0xF0，两构造入口0x5E279B与0x5E31BC设整数2。Province.IsStateCore 0x460B20：state!=null 且 distanceFieldToCapital<=state.coreProvinceDistanceField；**没有连通布尔限制**。

State.UpdateCoreProvince 0x5DD370，0x5DD492—4CE统计现有核心数；0x5DD4D1—4E1计算f32(f32(coreCount)/f32(total))，若 `!(ratio > CoreProvinceRate)` 则阈值+1。每次最多加1，不反复追到目标比例，不缩小、不排序、不clamp。相等也加；原unordered比较下0/0也加，JS写ratio<=rate会改变异常空列表行为。核心阈值大时断连省也能因有限距离成为核心。

CoreProvinceRate为独立国家字段，非politicalSystemAttributes.coreProvinceLimit。ApplyTraitEffect在0x5C0018重置f32(.15)，授权StateTraits的StrengthenCore直接覆盖.3（同STATE_BASE_RECOVERY.md JSON，16行）。更改比例不直接重写阈值。

## 刷新时点

距离直接重算：InitStateSimulationData 0x5D02F0→5D03B5；OnProvinceAdded 5D2DD0→5D3087；OnProvinceRemoved 5D30E0→5D3290；OnProvincesAdd 5D32A0→5D354A；OnProvincesRemoved 5D3590→5D36F8；PostLoadSaveData 5D3B50→5D3F62；State.Update 5E16F0→5E181B。

Update要求id非0、非死亡、可征服、非blank且World.IsGameNeedUpdate(6BAFF0)=isGameStarted&&!isGamePaused。阈值增加另在State.AdvanceOneYear 5BF500中内联同公式（5BF666—6BD），要求非死亡/非blank/可征服；StateManager.AdvanceOneYear 5069B0倒序遍历非0/非死亡国家，506A21调用。

RecalculateCapital 5D4E00于5D516C仅将新首都省距离写0，不重算所有省、不重置核心阈值；优先旧核心候选，再其他非旧首都省，随机选择；无候选回退省列表首项。不能把这一函数偷换成迁都后立即全部归零。

后续网页桥接需保留省图、国家省列表顺序、年度历史阈值。当前网页真实邻接可以作为显式桥接，但不冒充原cell邻接建图；最底层Neighbor生成、全部导入顺序和原年度→网页日数仍未恢复。v13不含这些新字段。
