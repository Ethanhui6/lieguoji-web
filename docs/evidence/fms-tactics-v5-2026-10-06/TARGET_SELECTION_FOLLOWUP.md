# 原作常备军目标选择（后续只读证据）

2026-10-06，Army.FindRegularTargetProvince RVA 0x3482B0–0x348C83。安装目录只读、未运行原作、未接入当前 v9。DLL SHA256 d42658a922155f6cc60295a64c02207e5eaa1d3a55fd5ed18dc8ecc562f9b82b。

GetRegularEnemyStates(5CEFF0) 结果为空时 34857F→348C81 返回空；本函数不承担独立的平叛选敌。

候选合并到 HashSet：

1. 本国 IsAtWar && !IsAtRebelWar 的省，predicate 379810，加入位置348548–3485BD。
2. 本国 borderRegularEnemyProvinces，字段偏移128，3485CF–3485E0。
3. 只有第1类本国受袭省列表为空时，加入 GetAllyBorderEnemyProvince(5CA080)，3485F6–34861D。
4. 每个常规敌国的全部 isSeaNeighbor 省，348622–34876B；不要求直接接壤，不代表可达或已有运输舰。

每省评分：

score = distance(currentCell, candidate.center) * (IsProtruding ? 2 : 3) * (Feature不同 ? 10 : 1) + distance(homeProvince.center, candidate.center)

坐标及Feature读取3487F2–3488C3；当前欧氏距离3489DF–348A8B；突出权重348A93–348AB1；跨Feature348B0D–348B22；归乡距离348B27–348B61，短辅助339D30–339DDE已核sqrt(x*x+y*y)。归乡项不乘前面的权重。Feature是CellData.Feature，不是国家ID。

返回硬优先级（348B65–348C7F）：最低分同Feature省 → 最低分异Feature且IsPortCityProvince省 → 最低分其余异Feature省 → 空。各组严格更小才更新，平分保留先枚举值；没有显式ID决胜或随机打散。

本函数未读敌我troops、军团数、士气、军粮、胜率或增援数量；本国受袭省与边境敌省竞争，不是所有救援绝对优先。当前网页军力比判断属于网页扩展，不伪称此原函数的规则。原作自主选择还须由上层RTS gate保护玩家目标。

尚未恢复：regular enemy分类、borderRegularEnemyProvinces刷新、盟友候选具体资格、IsPortCityProvince(34CEA0)、IsProtruding(458930)及完整可达性。不可用方法名补造完整逻辑。
