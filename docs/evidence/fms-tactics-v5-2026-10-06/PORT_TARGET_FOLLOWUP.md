# 原作跨海目标与突出部资格：只读后续

2026-10-06。只读用户授权的Windows IL2CPP安装包及既有索引；没有运行原作、访问个人存档/认证配置。DLL SHA沿用RECOVERY.md。以下是已核函数边界，尚未接入v9，也不证明网页完整跨海AI等价。

## Army.IsPortCityProvince，0x34CEA0

取world.burgs[province.capitalBurgID]，不是任意城，也不要求全国首都。province/world/burgs有效，城市索引>0且在范围内、城市非空且isValid（0x34CF7E—0x34D022）。传入固定最小水域规模20（0x34D04D），尾调用PortRuleUtility.IsBurgPortQualified(0x496E30)。

资格要求burg.port>0、cell有效、当前Elevation[cell]>=20（0x496EC6—0x496EFD，World.IsOnland 0x6BB160/比较0x6BB1B3），且直接相邻水面cell至少对应一个合格Feature。

TryGetBestAdjacentSeaFeatureForPort(0x497110)遍历data.Neighbor[burg.cell]，邻接cell高程<20；IsSeaFeatureQualifiedForPort(0x497030)要求Feature索引>0且在范围内、非空、isLand=false、Cells>=20、Type不等于lake（OrdinalIgnoreCase）。不要求Type一定为ocean。多片合格水域按Cells最多选，严格更大才替换，等大保留先枚举者（0x4972C0—0x4972CB）。

因此不能以省沿海代替真实港口中心城市，也不能将小池塘算港口。本函数不验证port标识值等于选中的Feature，也不判断出发港、船只、载军能力、同一可通航海域、封锁、外交或真实航线。港口创建/更新/失效生命周期未恢复。

## Province.IsProtruding，0x458930

遍历borderNeighborCells（0x4589B8—0x458A33），计算data.State[cell]与province.state.i不同的项数（0x458A72—0x458AA9），除以列表总数后严格>0.5（0x458B04—0x458B17）。恰一半为false；空列表浮点0/0不满足比较。没有写入isProtruding缓存字段。

这是边界邻接cell数量的国家归属比例，不是邻省数、边界长度、海岸曲率或敌军包围。没有外交判断，盟国/中立若在列表也计为异国。borderNeighborCells如何建立及是否含特殊水面，尚未展开。

与TARGET_SELECTION_FOLLOWUP.md结合，突出部候选的当前距离乘2，其他乘3；异Feature的合格港口候选有独立优先组。这两个已恢复布尔项仍不足以证明完整自动跨海运输，应先闭合港口生命周期与航线/运力规则。
