# 原作海岸线恢复记录

只读来源：用户自有 `D:/steam/steamapps/common/FantasyMapSimulator`（GameAssembly.dll、level0、sharedassets0.assets）。工具：已有 Il2CppDumper 输出 script.json/dump.cs、Capstone 5.0.7、UnityPy。没有运行原游戏，没有提交 dump、二进制或反汇编原文（保留在被忽略的 `.autopilot/fms-audit/binary/coastline-static/`）。

## 函数（RVA）

| 函数 | RVA | 恢复结果 |
|---|---|---|
| MathUtility.Basis | 0x3EE280 | b0=(1−3t+3t²−t³)/6，b1=(4−6t²+3t³)/6，b2=(1+3t+3t²−3t³)/6，b3=t³/6 |
| MathUtility.CurveBasis | 0x3EEBD0 | 首尾逐分量 <0.001 → Closed；否则每段 i 用 P[i−1]/P[i]/P[i+1]/P[i+2]（端点夹取），j 从 (i≠0) 到 n，t=j/n；x=((p1·b1+p0·b0)+p2·b2)+p3·b3 |
| MathUtility.CurveBasisClosed | 0x3EE750 | 环形取点 (N−1+i)%N…；与上一结果完全相同的点跳过；末点≠首点时追加首点 |
| BorderCalculationHelper.SmoothBorderLines | 0x3655F0 | VoronoiTransformPoint(z=−0.003) → CurveBasis(·,4) → 保留首尾，去除与前一点 NearlyEqual(0.001) 的内部点 |
| Vector3Extensions.NearlyEqual | 0x3F6D80 | 三个分量都满足 \|a−b\| < tolerance |
| BorderDataProcessor.IsCoastLineEdge | 0x36C790 | 可见边、两侧 site 存在，且恰一侧 Elevation < World.seaLevel(+0x19C) |
| BorderDataProcessor.UpdateCoastLine | 0x36F180 | 串链（ExtendCoastLine），用首段中点沿法线偏 0.1 取格判断陆地方向，再 SmoothBorderLines |
| StateLineRenderer.ProcessPendingCoastLines | — | 可见线：BlendMode 0、Closed=首尾距离²<1e-10、Joins 0、Thickness=coastLineThickness、Color=World.coastLineColor(+0x4F8)；SDF 线：Thickness=shallowLineThickness、Geometry 1、OffsetInner/Outer=±0.1、专用 layer |
| World.VoronoiTransformPoint | 0x6CACA0 | x / Width × BoundWidth − BoundOffsetX |
| World.SetResolution | 0x6C2FF0 | 四边形 localScale = 15·scale·(W/gcd, H/gcd)；World.Start / ChangeMapSize 传 1600×900 |

## 场景序列化值

- StateLineRenderer#31729：religionBorderThickness 0.2、provinceBorderThickness 0.15、curveAmount 0.5、interpolationPoints 5、stateLineThickness 0.25、coastLineThickness 0.25、shallowLineThickness 1.2。（构造器默认 0.2/0.5/0.8 被场景覆盖。）
- coastLinePrefab Polyline#860：thicknessSpace 0（Meters）、joins 2（预制件；运行时改为 0）。
- DisplaySettings#43912：8 个预设；羊皮纸预设 0/3/7 coastLineColor = (0.3725, 0.3725, 0.3725, 1)。
- PlayerController#38720：MovementSpeed 10、ZoomSpeed 5、ZoomMin 5、ZoomMax 20（解释为相机正交尺寸属推断）。

## 未知

`SetCoastLineThickness` 没有直接 call 调用点（可能经 UI 委托）；`shallowLines` 的生成和颜色未恢复；原作最终 SDF 相机/海陆 alpha 合成未逐点联调。
