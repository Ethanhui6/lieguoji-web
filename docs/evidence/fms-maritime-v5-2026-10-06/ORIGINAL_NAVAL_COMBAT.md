# 原作海战：三函数只读核验

来源为用户授权的 D:/steam/steamapps/common/FantasyMapSimulator，GameAssembly.dll SHA256 d42658a922155f6cc60295a64c02207e5eaa1d3a55fd5ed18dc8ecc562f9b82b。PE/Unity IL2CPP29；通过已有元数据索引定位小范围反汇编。没有读取SDK认证、个人存档，没有运行原作或恢复脚本；原始dump不收录。

- Navy.BattleInSeaProvince，RVA0x4211A0，2960bytes：读取同海区 naviesInProvince(+0x138)、armiesInProvince(+0x128)，依据_enemyStateSet过滤。0x421534累加deltaTime，0x421540–0x42154A到间隔才伤害；0x421562 Random.Range(1,3)，0x421567乘2，后续间隔为2–6个传入deltaTime单位。调用者未恢复，不能直接换成网页天数。
- 伤害系数由State.destiny(+0x1E4)/30限制在0.1–10，ethnicAttribute(+0xD8)的Maritime=3乘1.5，再加入领袖海军修正。0x421754基础40，除以有效敌海军数，扣navyCount。攻击舰剩余navyCount未出现在这段公式中。
- 水上陆军先由World.IsOnland排除陆上军，0x4219F3实际倍率320，而非仅按metadata常量40推断；商船入口倍率120，商船内部未恢复。
- 0x4214AE调用BattleFxSystem.ReportSeaBattle，强度依据真实参战计数；0x4214BD–0x42152F静止舰启动RandomMoveInProvince协程。协程内部未恢复，网页没有复制该轨迹。
- Navy.GetStrengthFactor，RVA0x422A30，144bytes：clamp01(navyCount/max(1,maxNavyCount))；未在上面损伤函数中调用，不能用它推断原作该伤害轮按剩余兵力比例缩放。
- Navy.HandleWarToPeaceTransition，RVA0x422AC0，176bytes：清攻击/驻守目标，回Idle，停移动和战斗协程，不写当前位置。未证明原作玩家主动撤退状态。

网页有限适配：连通湿三角/同一湿边近距接触，100舰体/船、每30tick一轮、8×船数×剩余船员比例并在敌方间分摊；伤害同时结算。全部数值与主动撤离是网页规则，不称作原作公式等价。停战立刻清交锋，不伤害和平舰队；保留现有航路，不声称复原原作清空全部航令。沉没同步销毁运输载军。没有港口封锁、商船或自动远征。
