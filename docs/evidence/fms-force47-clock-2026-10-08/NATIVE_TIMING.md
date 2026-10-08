# 海军首次间隔与伤亡登记边界补证

仅只读用户授权安装包与已有索引。未运行原作或恢复脚本，未新增raw/dump、认证资料、SDK配置或个人存档。

- `Navy.ctor` RVA `0x428390` 的真实直线函数54字节 `[0x428390,0x4283C6)`：`0x4283AF` 将 `m_DamageIntervalRnd(+0x50)` 写为 `0x40000000`，即float32(2)。SHA-256 `caa0760d9b2ca941c19325a08577a1aebe95c33f1e81f9464156c40a8d995f98`。
- `Navy.Init` RVA `0x4230F0`，192字节索引范围：`0x42314D` 清零 `m_BattleTimer(+0x4C)`；`0x42315B` 写qword `0x40000000` 到+0x50，低32位首次间隔2，高32位相邻搜索时间0。SHA-256 `bf0ada7bcbb3d5127295fe8574a8b13d4f9eb85b3d5fd95f8436b51bd6ba3f12`。
- ctor到下一个命名方法的832字节索引间隙含其他未命名函数，不当成构造函数大小。上述54字节止于终尾跳转。
- 后续间隔已有证据为 `2 × Random.Range(float 1,float 3)`；本轮不重复反编译。首次Init间隔不能证明每次遇敌都重置计时。
- `Navy.BattleInSeaProvince` RVA `0x4211A0`，2960字节，SHA-256 `b718a7f5d8db24cc4bc006e829dea2902ab7cb4433f62bfc5823ab5441a1bbba`。`0x42181A–0x421823` 直接扣敌舰navyCount，`0x421B10–0x421B1C` 直接扣敌军armyCount，随后返回各自枚举。完整方法没有War kills/deaths、TakeDamage、战功或死亡清理回调。
- `BattleFxSystem.ReportSeaBattle(0x4214AE)` 是表现报告，不当成伤亡登记。外层死亡移除/统计路径未核实。

只读复核者 native_sea_army47；上述是静态指令证据，不是原作运行测试。浏览器使用独立随机流、单位尺度及持久化，区别见 CHECKPOINT.md。
