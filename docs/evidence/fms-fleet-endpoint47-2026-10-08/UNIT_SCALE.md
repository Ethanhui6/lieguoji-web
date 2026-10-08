# 完整47启用前的地图单位风险

这是对**尚未启用的新47候选**的静态量纲检查，不是对用户正在玩的v46、900天世界的现场诊断，也不是900日跑测。

- `civilization47-military.ts`校验 `forceClock.secondsPerTick === life.secondsPerDay / 120`；当前日历的secondsPerDay为float32(.1)。`force-tick47`把tick差传给统一移动，`actualForceSpeed47`把原速乘secondsPerTick。当前没有发现这里重复乘秒的证据。
- `force-speed47.ts`却明确把`mapUnitsPerNativeUnit`锁为1，注释也说明Unity→网页地图尺度尚未测量。`army-travel47-graph.ts`将地图最长边归一为1000。这两个数字不能自然等同。
- 既有[原地图编辑恢复](../fms-battle-animation-v5-2026-10-06/ORIGINAL_EDITING.md)证实World.AddRiver 6A2450存在独立转换：`x=(worldX+BoundOffsetX)/BoundWidth*Width`。图坐标、Unity世界坐标、网页1000尺度必须分别核对；该证据没有给出当前生成世界的BoundWidth/Height数值，也没有证明运动速率可直接使用图坐标或逻辑分辨率。
- 只读复核既有ignored `military36-path-native.txt`：378707读取CellData+0xF0的WorldPos(Vector3)，区别于+0xF8的逻辑Pos；378767读取deltaTime，37878D乘speed，3787D9写Transform.position。速度确实用于世界坐标。World.UpdateBounds仅定位到6C6F00，本次没有展开其实现或取得实际边界值，不把方法地址当完成比例恢复。
- 若沿上述逻辑图映射到最长边1000，令M=max(Width,Height)，X/Y长度换算分别为`1000*Width/(M*BoundWidth)`、`1000*Height/(M*BoundHeight)`，两轴一致才能折成单个标量。下一限定索引：World的BoundWidth+0x128、BoundHeight+0x12C、BoundOffsetX/Y+0x130/+0x134、Width/Height+0x138/+0x13C；位置偏移不能当长度倍率。仅有字段与公式，不代表实际值已恢复。
- 在当前未校准1:1映射下，普通海上Army每日约走0.1575—0.2475网页单位；这是初始化速率范围×海速1.5×.1日时长的静态推算。现有网页6点移动日粮从100点起只有16整日，第17日起不足。不能据此宣称真实原作也是这个节奏。
- 两岛测试的10,000,000 movement参数按当前调用桥是tick数，约83,333.33天的移动量；没有推进日历、食物或战斗。它只证实路径拓扑、位置和身份连续，不证明900日内存活登陆。
- 当前陆军自主命令在实际本国陆地低粮会停驻，但海上在途且敌方目标仍有效时会先保留路线。该分支不等于保证低粮自动返航，完整实验须记录它与随身口粮的实际结果。

下一步先以固定两岸距离量测“真实日界推进→军粮→实际距离→接敌/抵岸”，再据已恢复World Bounds和速度空间核实比例。若原比例仍缺证据，应明确保存、版本化网页尺度方案及测量依据，不能随意加速、无粮航行、修改旧46或用摄像机缩放调军速。正式900日战役及完整新47启用在此项未核前不宣称通过；其他真实舰队部署/造船接线可继续。
