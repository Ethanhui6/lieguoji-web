# 本批原作陆战与进攻箭头只读证据

日期：2026-10-05。用户指定且授权的安装目录：D:/steam/steamapps/common/FantasyMapSimulator。只读静态核验，没有运行原作、恢复脚本、认证/SDK配置或个人存档。对象为PE/IL2CPP，不是ELF/DWARF，未调用hk4e。GameAssembly.dll SHA256：d42658a922155f6cc60295a64c02207e5eaa1d3a55fd5ed18dc8ecc562f9b82b。

## 已定位并核验的方法

| 方法/RVA | 可证实的行为 | 本批适配及边界 |
|---|---|---|
| Province.CheckWarStatus 0x4509B0；GetEnemyArmyInProvince 0x454660 | 按省内army列表和敌国关系判定，frameCount缓存；不是两图标距离碰撞 | 网页以节点/同一道路实际接触触发。途中拦截为网页新增规则，不声称原作等价 |
| Army.EngageInBattle 0x347540；IsInBattle 0x34CE10；UpdateState 0x3523E0 | 停止FollowPath协程，isMoving=false，状态Attacking；按Time.time差推进状态 | 网页权威tick停止军队，保留路段位置，战后续行 |
| Army.BattleInProvince 0x344100；RandomMoveInProvince.MoveNext 0x378D30 | 交战期间可沿省内真实cell路径移动；计时到期后下一间隔Random.Range(1,3)*2，初始2游戏秒 | 本批未恢复省内寻路游走；战损用确定性的0.1网页日脉冲，不把2–6游戏秒偷换为网页日 |
| Army.AddDamageToEnemyArmyInProvince 0x342DF0 | 省内敌军列表；combatEfficiency*damageToArmy*max(1,damageMultiplier)/敌军数；enemy.isElite另乘0.1 | 网页保留已有兵力/士气/粮食/地形/兵种公式，改为持续同时结算并保存小数余量；完整效率系数与elite属性未恢复 |
| MathUtility.CalculateBezierPoint 0x3EE440 | 二次Bezier (1-t)^2P0+2(1-t)tP1+t²P2 | 网页采用同一公式 |
| AttackArrowRenderer ctor 0x360510；UpdateBezierCurveWithGrowth 0x35FFD0 | 默认30采样，宽度8→3，outlineOffset .3，growthDuration1，startOffset .1/endOffset .25；body/outline/tip | 网页30采样、渐窄方向箭头；CSS尺寸/透明度/控制点为网页适配，未恢复完整prefab/growth动画 |
| Province.EnableBattleArrow 0x452120；GetPathMidPointToProvince 0x4550E0 | 按目标省、来源敌国分组，兵数排序取最多两组；控制点关联cell路径 | 网页用军令真实路径计算方向；远景限量显示避免遮挡。细线是实际道路，宽箭头是战略方向 |
| Province.UpdateBattleSword 0x45E450；GetBattleFxPosition 0x4537C0；BattleFxSystem.ReportLandBattle 0x3F7990 | 战争判定驱动；位置取真实军队Transform平均，空列表回落中心 | 网页交锋标记只由活跃engagement产生，位于实际接触点；没有随机预制战争动画 |

静态证据使用既有方法/地址索引结合本次内存PE解码；raw dump不提交。原作BattleSword/swords纹理/Animator依赖未完整验证，本批未声称恢复完整战斗动画。原军种图标继续复用此前已登记的五类素材，来源见../fms-watch-controls-v5-2026-10-05/military-provenance.json。

尚未等价：原作省内微观游走、完整AI/指挥官效率/技能、原生箭头生长、动画素材绑定、围城与海战。真机/用户视觉评价仍待验收。
