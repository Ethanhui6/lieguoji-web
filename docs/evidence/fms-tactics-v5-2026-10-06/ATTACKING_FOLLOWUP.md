# Army.Attacking 后续只读恢复

2026-10-06，原包 DLL SHA256 d42658a922155f6cc60295a64c02207e5eaa1d3a55fd5ed18dc8ecc562f9b82b；只读单函数 RVA 0x343700–0x343FA8。未运行原作、未改安装目录。原作完整野战空间模型未恢复，当前 v9 不与此函数完整等价。

C=currentCell 所属省，T=targetProvinceObject，U=isUnderRTSControl，A=isRTSAttackMode。

| 分支 | RVA | 已证行为 |
|---|---|---|
| RTS抵达且Attack | 343801–343878 / 343A2B→343B15 | 清U恢复自主；继续目标有效性检查，可能同次换目标 |
| RTS抵达且Defend | 343A35 / 343A72→343A77 | state=Idle，保留U，仍继续本函数；不是立即return |
| 无目标或非交战非敌目标 | 343A77–343AD8 | 仅非RTS自主重新选择常备/叛军目标，仍为空再通用选目标 |
| C等于有效T | 343BCA–343BDF→343DAF | BattleInProvince，无额外U/A/距离检查 |
| C不等T，当前省IsAtSeaWar | 343C98→343DB9 | 改目标为C，停止移动协程，省内随机移动，按军团计时伤害敌军；本分支不调BattleInProvince、不削省抵抗，不等于完整Navy实现 |
| C不等T，当前省无陆战 | 343CAA→343CF5 | 保留有效移动协程，否则启动MoveToProvince |
| C不等T，当前省有陆战且U | 343CB3–343D78 | 继续手动目的地；已有协程会先停清再重启。途经战区不必停战 |
| 当前省有陆战，非RTS或T=C，且非A | 343D7D–343DAF | SetTargetProvince(C)，停协程，isMoving=false，BattleInProvince |
| 上行但A=true | 343D7D→343DAA | 直接BattleInProvince，不先重写T、不在这里停协程 |
| 重新选目标仍空 | 343B65→343F4B–343F91 | 停清协程、清闲逛目标，armyType=0/currentState=0；不是销毁军团 |

## 可达性与移植边界

BattleInProvince/AddDamage使用目标省敌军，效率读取当前省。因此指令流存在当前省触发但T未重写的组合；尚未核清 C!=T && !U && A 的上游正常可达性，不能贸然复刻跨省远程伤害，也不能擅称该组合是已证原作Bug。

当前网页 sync/contact/swept contact 使用同节点或同一道路实际相遇；不包含原省级所有敌军对象，也无独立RTS Attack/Defend接敌语义。连续地点进攻先处理沿途交锋/占领，是明确网页适配。

下个规则版本先独立持久化玩家目的地、接战省、RTS控制状态，以本表建立决策测试，再接移动、伤害和占领。省内非同路索敌继续单列待恢复。没有从本函数发现碰撞半径、射程、伏击隐蔽或完整cell寻路；不能把当前恢复称作完整空间战斗复刻。
