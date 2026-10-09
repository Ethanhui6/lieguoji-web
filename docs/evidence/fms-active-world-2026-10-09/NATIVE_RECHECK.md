# 2026-10-09 原作时标、驻防与网页停滞复核

用户要求重新核查指定安装包并启用子智能体。本轮三个子智能体并行只读，主执行者独占修改和浏览器验收。
安装包 `D:/steam/steamapps/common/FantasyMapSimulator/GameAssembly.dll` SHA256：`d42658a922155f6cc60295a64c02207e5eaa1d3a55fd5ed18dc8ecc562f9b82b`。
这是 PE/IL2CPP 静态代码与已恢复资源链，不是原作现场运行或原始 Unity 工程；未读认证、SDK 配置或个人存档。

## 本轮新闭合的原作依据

| 范围 | 原生依据 | 网页差异及处置 |
|---|---|---|
| 世界尺度 | `World.SetResolution 0x6C2FF0`：宽高除 GCD 后乘 `15*scale`；`Start 0x6C4EB0/0x6C4EF6` 传 1600、900、1，之后 `0x6C549F UpdateBounds` | 标准原作实际 240×135，网页最长边1000应换算1000/240。撤回本轮尚未发布的100倍试验；不拿24倍空间加速当原作还原。 |
| 大图及加载 | `ChangeMapSize 0x8CFAC0` 参数3取scale2；`DeserializeParsedData 0x6A8090` 对原生CellCount>60000取scale2，调用后UpdateBounds | 原作大图480×270。网页当前固定标准长边尺度；网页采样点/三角不是原生CellCount，不自动据此触发大图。非16:9网页地图是明确长边适配，不宣称几何等价。 |
| 日期与攻击 | TimeManager.Update `0x523F10` 累积scaled delta；默认日长float32(.1)；第一击2秒，后续2×Range(1,3)秒 | 保留已核攻击秒数。网页原先6/8点日粮承袭3秒/日，接回.1秒/日后会在首次20日攻击前断粮。现按1/30换算网页口粮日耗，舰队整数粮向上取整；这是网页资源规则修正，非原作粮食公式。 |
| 和平驻防 | `ArmyManager.BatchUpdate 0x35911B → UpdateState`，`0x352526 → Idle`，`Idle 0x34C59D → FindTargetIdleProvince`，`0x34C664 → RandomMoveInProvince` | 47漏接驻地选择，而38—46已有。接入已有nativeIdleArmyPools/nativeChooseIdleArmy，再执行真实军令；保存并保留有效驻地。省内随机漫游尚未接入，不伪造热闹。 |
| 国家决策 | `AssignRandomUpdateDays 0x508270`，`UpdateStates 0x50D980`，`AdvanceOneMonth 0x5BF120`先UpdateStateData、UpdateArmy、UpdateDiplomacy | 首月游标修复保留；原作不是每天全部国家宣战。财政/征募仍用30日网页月，与ISO外交月的统一尚未完成。 |
| 海军闲置调度 | Navy.UpdateIdle `0x426F1C` 取unscaledTime，和平冷却18—32秒；NavalSystem.Update `0x4200B6`也取unscaledTime | 当前40tick/秒来自旧3秒/日，仍不是原作独立非缩放时钟。明确待接，不能声称全部时间等价。 |

`World.SetResolution` 精确PE范围 `0x6C2FF0–0x6C32E5`，757字节，SHA256 `c91c905185fc8f784f9011eff1466e7c1ff6f3ad9d2d5e532855618eadbe23a9`。
`World.DeserializeParsedData` 范围 `0x6A8090–0x6A8A52`，2498字节，SHA256 `b1036f014981dda4d0080456d31f069d9d2b123f4a63f251d63da07d0d3a3c52`。
`Army.Idle` 0x34C390/912字节 SHA256 `3877cb1698fe994133aaba81e6e0822deee2e3d6d0f7a497cf2ff5fab3c7911a`。

## 性能修复合同

保留每个公共tick、真正边界相遇、攻击期限、日结、CAS和旧引擎。减少重复路径分配、未发生占领时的全世界复制、同一action内重复几何比较、跨action重复海图构造。数值缓存有独立内容见证并在提交前检查整个buffer；可写别名修改必须仍被检测。正常地图浏览器通过前不宣布“看海已修好”。

前次完整浏览器8例6过2失败：正常生成36864点地图120秒到第8日的门，桌面只观察到7日、移动仿真5日；这些失败保留。旧62/122单测通过不证明当前新增驻防、粮耗与尺度通过。新结果单列，真机及原作视觉门保留。
