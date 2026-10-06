# 原包整编后续只读证据（未接入当前 v9）

2026-10-06，原包 DLL SHA256 d42658a922155f6cc60295a64c02207e5eaa1d3a55fd5ed18dc8ecc562f9b82b。只读恢复；未运行原作，未写安装目录。本页记录的是源码行为，不是网页已实现或视觉验收。

## 调用链

- ArmyManager.Update 0x35D060，在 0x35D2F8 调 Army.GetArmyOrganization 0x34B030；分类 1 于 0x35D307 调 Reorganization 0x34F9D0，分类 2 加入销毁队列。
- ShouldReorganization 0x351500 与分类函数核实：兵力耗尽、国家仍存活、homeProvince.state 等于 army.state、非 isEmergencyCall、homeProvince.armies.Count <= homeProvince.armyLimit 才重编。这里是故乡所属军团列表，不是实际驻军列表。没有以 isMannulCreated 排除手工军团。
- Reorganization 0x34F9D0 直接移到故乡中心，Init / SetCurrentCell 更新索引，停止旧移动协程，清旧攻击与战斗计时。重设当前满编的 10%，currentState=5。不是幸存军沿路返乡，也不是立即满血。
- 正常既有军团的成立时间非零，Init 不重新分配军团编号。

## 连续补员与费用

Province.GetArmyReorganizationDuration 0x453700：D = 20 - 10 * clamp(home.population, 0, 25000) / 25000。

ReorganizationUpdate 0x34F7D0 每次重新计算 M=故乡当前满编（无有效正值则中位满编）、D，以 Unity.Time.time 的差作为 deltaTime，增加 deltaTime * M / D，达到 M 夹到 M 并完成。静态、不受伤时从 10% 起需要 0.9D，即 9–18 个 Unity 缩放秒；人口 1300 时约 17.532 秒。原管理器分批更新使完成时间按更新帧取整。

完成时一次扣 cost=trunc((100-destiny)*500/100) 金币。若 gold<0 且 abs(gold)>8*goldPerMonth，cost再trunc(cost*0.1)。不要求付得起，允许负债。当前恢复链未见人口或粮食扣除；不能重复套新军征人口，不能用网页粮食替代金币并称为原作。

## 行动与取消边界

- UpdateState state5 先 ReorganizationUpdate，再 Idle；Idle 当前省 IsAtWar 可 BattleInProvince，其他情形可走驻守移动。原作整编不是绝对静止、无敌或禁止交战。
- 故乡归属等是进入重编资格；上述 Update 并未逐次重复全部条件。GetArmyOrganization 对仍有正兵力者主要检查国家死亡。UpdateState 若故乡所属军团列表不再包含自身会设 armyCount=-1。故乡转属时其他管理代码如何维护列表尚未全部恢复。
- 海上损失、完整故乡转属取消链、整编中驻守移动尚待独立核实。

## 下一版本接入约束

当前已检查 v9 尚未实现此状态机。新增时先冻结已发布 v9 的实际执行源和存档分派，建立下一版本/独立库/显式副本；保存身份、整编状态与小数余量，刷新不得重复得到 10% 或重复结算。当前网页 schema 缺原作 gold/destiny/goldPerMonth，不伪称费用链完整。正式真机/视觉门及生产发布锁继续保留。
