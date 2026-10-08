# 原作 Army 基础速度与时标的有界补证

2026-10-08。只读指定安装包 `D:/steam/steamapps/common/FantasyMapSimulator` 的 Windows IL2CPP PE；本批只复核 Army 构造与 Init 的有界函数字节，没有执行原作、恢复脚本或读取认证、SDK配置、个人存档。DLL SHA256：`d42658a922155f6cc60295a64c02207e5eaa1d3a55fd5ed18dc8ecc562f9b82b`。这不是运行时或画面等价证据。

## 构造值会被 Init 覆盖

| 方法 | RVA / 字节 | 函数字节 SHA256 |
|---|---|---|
| Army.ctor | 3529B0 / 448 | 53802f511db1e7bc5cb7a2cd99a7ea995522025bc3b9377bbb368dc223193a97 |
| Army.Init | 34C720 / 912 | 1dcb08af7b13427ad64bdb312412cbdf343522ccc6f9093f59910bec4d6d4c95 |

已有本地索引 `.autopilot/fms-audit/binary/dump/dump.cs`：Army.speed `+0x84`（3843行）、Army.ctor（4233行）、State.IsCavalryTradition `+0x32F`（8779行）。分析 dump 不进入 dist。

- `352A6A mov dword ptr [rbx+0x84],0x3FC00000`：构造默认为 float32(1.5)。
- `34C9E9 cmp byte ptr [rax+0x32F],dil`，此处 state 的骑兵传统布尔值与0比较。
- 普通分支：`34C9F2/34C9FD` 装载 float32(1.1) / float32(0.7)；`34CA05` 调 Unity.Random.Range；`34CA0A` 乘 float32(1.5)。
- 骑兵传统分支：`34CA14` 装载 float32 `1.9499999284744263`。
- 两分支于 `34CA1C movss [rbx+0x84],xmm0` 写入实例速度。

因此新军队初始化速度约为普通国家 1.05–1.65、骑兵传统国家 1.95。**国家传统不是部队兵种**，不能将所有骑兵直接设为1.95；兵种倍率另由已恢复 GetSpeed 的陆地分支处理。随机值在 Init 写入，不能每帧、每格、每次读取或刷新存档重抽。网页若采用确定性 PRNG，须显式作为适配并把已生成实例速度持久化。

## 已有时标证据不重复恢复

[ORIGINAL_CLOCK.md](../fms-continuous-motion-v5-2026-10-05/ORIGINAL_CLOCK.md) 已记录：TimeManager.Update `523F10` 累加 Unity.Time.deltaTime；WorldSettings.cctor `6E2240` 于 `6E22D6` 写默认 dayLengthInSeconds=float32(0.1)；GlobalTimeScaleManager.ctor `38B0D0` 七档 `[0.1,0.5,1,2,3,4,5]`，默认索引2；ApplyGameSpeed `38AE06` 写 Time.timeScale。旧 `.autopilot/military36-path-native.txt` 的 `3788CF` 证明入实际格后重取速度。

合同应分开表达：位移=当前 GetSpeed × scaledDeltaSeconds；日历增量=scaledDeltaSeconds / secondsPerDay。不能以日期天数、寻路成本或渲染插值比例代替移动秒数。默认日长不代表所有存档的日长，TimeSerializationData.SecondsPerDay 已在 dump.cs 42182行定位。

## 仍未验证

Init 是否在恢复、重组等生命周期再次调用，以及其他方法是否改写 speed 字段，本次未扩展。Unity 世界坐标与网页1000单位地图的尺度映射尚未实测；网页如果继续较慢日长，须明确选择保留每模拟秒速度或每天行程，不能同时声称两者完全与原作一致。旧报告“陆军基础1.5”只覆盖构造值，后续不得将其当所有实例速度；本补证覆盖较早笼统的“绝对时标全部未知”，不修改历史证据。
