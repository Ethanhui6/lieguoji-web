# 原作海上目标与海军伤害：有界静态依据

授权安装目录：`D:/steam/steamapps/common/FantasyMapSimulator`，只读 `GameAssembly.dll` 与已有方法索引。没有启动原作、运行恢复脚本、读取认证/SDK/个人存档。原始安装包和 dump 不放入本证据或 dist。以下是本批只读研究者提供的指令级证据，不是实机录像。

GameAssembly SHA256：`d42658a922155f6cc60295a64c02207e5eaa1d3a55fd5ed18dc8ecc562f9b82b`。

## Navy.BattleInSeaProvince

RVA `0x4211A0`，2960 bytes，区间 `[4211A0,421D30)`，方法字节 SHA256 `b718a7f5d8db24cc4bc006e829dea2902ab7cb4433f62bfc5823ab5441a1bbba`。已有 dump.cs 签名索引32202。没有将完整原始反汇编提交。

- 421592–4215C8：`destiny/30`，float32 clamp到 `.1..10`。
- 4215CC–4215D5：族群枚举3（Maritime）乘1.5。
- 4215E7调用 State.get_Leader（5E3B40），4215F1检查 Character.isAlive；4215FC调用 GetNavalCombatModifier（83C010）。绝对值大于float32(.001)时，乘 `max(.1,1+m)`。相同地址还存在Family.get_Patriarch别名，但本调用接收者是State；不能因此误标家族首领规则。GetNavalCombatModifier内部尚未恢复，网页要求显式输入而不猜技能值。
- 421839–421946：统计Unity对象有效、国家非空、实际不在陆地且敌对的 Army。421918和421AE8均排除实际陆地对象。
- 4219F3乘320、421A02除有效敌方 Army 数，421B10–421B1C从armyCount扣除。此分支没有读Army.isElite，也没有乘攻击方剩余舰体或Army规模。
- Fleet部分另有40/有效敌方Fleet数预算，**不与Army的320预算合并**。

此方法本身不负责整数显示兵力、钳制到0、删除对象或 cargo。这些是显式网页适配。native navyCount与网页舰体量纲未证明相同，因此接入比例保留为明确参数，测试中的1只代表夹具。

## Army 海战与触发

既有 Army.BattleInSeaProvince：RVA `344B70`，416 bytes，SHA256 `a5312f832bb8b6286ae62ce70be17143f0ccdfc1e2a7b4b4050175803d62e9db`。已只读核对既有方法提取记录1177行；不重复全包恢复。

该方法清除目标移动，在未移动时启动省内移动；积累deltaTime，达到阈值只执行一次攻击，再设置 `2 * Random.Range(1,3)` 并清零计时。344C41重新计算效率、344C57调用 AddDamageToEnemyArmyInProvince(efficiency,1)。它攻击 Army，未证实 Army→Fleet 攻击。damageToArmy来自Init的40乘国家陆战效率，不应恒定硬编码40。

Province.IsAtSeaWar 已有依据说明：真实海区内任意 Army/Navy 敌对组合触发全区海战；全区触发与具体敌方伤害目标是两层判断。网页使用持久水域分区代替原生Voronoi省，属于明确几何适配。

原作2–6间隔是deltaTime尺度，不能直接改口为网页2–6日。日历默认.1秒/日及七档速度已有上批证据；本批没有重新标记为新恢复，更没有由静态函数推断完整实时战斗体验已经一致。
