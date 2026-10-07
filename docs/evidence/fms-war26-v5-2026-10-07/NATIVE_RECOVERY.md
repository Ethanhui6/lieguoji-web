# 原作战争V2叶函数恢复与网页适配边界

2026-10-07，根唯一写入；代理只读定位与复核。只读授权安装 GameAssembly.dll，SHA256 d42658a922155f6cc60295a64c02207e5eaa1d3a55fd5ed18dc8ecc562f9b82b。没有运行原作、恢复脚本、读取认证/SDK/个人存档。未提交 raw dump。

| 函数 | RVA | 核实行为 |
|---|---|---|
| WarProvinceQueryV2.GetProvinceDistance | 68A590 | 先取世界；空省返回 float max；有效坐标按原顺序进行 float32 三轴平方距离；缺坐标用 int32 溢出语义的 ID 差绝对值 |
| SelectCompactFrontierProvince | 68BA40 | 原 HashSet 次序；排除水域/他国；优先已选邻接数，再严格较短距离，再 float32 .001 容差下较小 ID；不能改成通用 sort |
| AppendDefenderLandNeighbors | 688EB0 | 先查邻居键是否已选，再解析省对象并按 object.id 加入 frontier；过滤水域及非守方 |
| GrowClaimFrontier / Component | 68B020 / 68AF30 | 初始化已有已选集合边界；总 result 数达到配额停止；种子先加入，重复种子不再次扩张；不跨非守方地区 |
| ChooseOccupyCount | 668830 | count<=1 返回1；兵力比 float32，经 .45 阈值与 Clamp01；至少 ceil(count/3) 与2，原 ties-to-even 加权，最后约束1..count |
| State.GetStrength | 5CF340 | 已核实数值归并次序：军队与海军标准化后各乘2，省数乘5，最后加1；原帧缓存/对象生命状态/世界设置供应者未生产复刻 |
| Army.GetMedianMaxArmyCount | 34B9D0 | max(1, median / max(.0001, displayFactor))，float32；原设置默认值未核实 |

HashSet<int> AddIfNotPresent 12CD280 / Remove 12D9A40 / MoveNext 11A8B30 / SetCapacity 12DA040：槽号顺序枚举，删除槽LIFO复用，成功变更作废迭代器。新 NativeWarIdSet 覆盖此处实际需要的语义，不声称覆盖整个 .NET HashSet API。

已记录函数字节指纹：GetProvinceDistance 528字节 817aefcf9f138fa86201886d71b47fb3abd72751fc47b64cba0c9ac5d3f4c643；State.GetStrength 1088字节 93655ad0a5b489745540fcf6f4be49bf55e9d8920dfd9db0d2ed108ddd489a12。Round辅助37AC80/256字节 c07da721ac06e319f5e8ccc652c6bbc129044106e2e292214622a7977a44affa，经 ties-to-even 固定样例核对，复用已恢复 native-round；其源码进入新引擎哈希依赖闭包。

## 生产适配范围

- 战初保存双方连片省份目标及所有权快照，之后占领不重抽目标。陆军沿剩余目标距离推进，仍遵守中立边界、补给、实力、真实接敌、救援和玩家军令。
- 进入目标的种子排序是明确的网页策略：陆地接壤优先；否则选择实际运输执行器支持的异陆块同海域港口。没有恢复完整 BuildConnectedClaimProvinces；同一大陆隔中立国的沿岸绕行仍不支持。
- 原GetStrength数值结构使用网页实际人数/2000及船数/5。2000与5是网页尺度，不是原设置恢复值；网页二维(x,0,y)和稠密ID是输入桥接。
- 海运只从真实目标陆路可达的港口候选中选取，实际集结、装载、海路、登陆、返航沿用已有闭环。只保留集结中的陆军；空舰返航不再阻止已登陆军团继续作战。
- 未接：完整CB及资格、战争分、厌战、胜负和约、递增停战期、首都满月危机；没有宣称全战争V2或原AI等价。

## 独立版本

v26 / fms-war-26 / Store28 / lieguoji-fms-war-v26。v25及更早版本以原引擎和原库继续运行。v25归档manifest逐文件比对，新增行为仅在v26。保存保持版本锁、未知字段锁、CAS、current/backup和超时中止保护；创建新规则副本不重划原世界，不写原库。
