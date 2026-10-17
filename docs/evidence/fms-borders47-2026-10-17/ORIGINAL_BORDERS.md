# 原作国界与海洋 SDF 源线恢复记录

只读来源：用户自有 `D:/steam/steamapps/common/FantasyMapSimulator`（GameAssembly.dll、level0）。工具：已有 Il2CppDumper 输出、Capstone 5.0.7、UnityPy。没有运行原游戏，dump、二进制和反汇编原文留在被忽略的 `.autopilot/fms-audit/binary/coastline-static/`，没有提交。

## 国界

| 函数 | RVA | 恢复结果 |
|---|---|---|
| BorderDataProcessor.UpdateStateLine | 0x3744E0 | 每个国家：IdentifyBorderCells → ExtractBorderSegments<int> → ConnectBorderPoints → GetLineVertices(z −0.003)，原始点存进 sample 缓存；再 SmoothBorderLines（即 CurveBasis(points,4)）存进线缓存；PolyLabel 求国名位置；最后调 UpdateCoastLine、UpdateShallowLine |
| BorderCalculationHelper.ExtractBorderSegments<int> | 0xBC4E80 | 地图边框上的格边也算国界；其余为相邻格所属不同的边（海也是“不同”） |
| StateLineRenderer.BuildRenderableLine | 0x4E5360 | 超过 2 点时 CurveBasis(points,4)，再 RemoveDuplicatePoints(0.0001) |
| StateLineRenderer.SetStateLines | 0x4F89A0 | 每条国界一个 Shapes Polyline。普通国家：线宽 stateLineThickness、z −0.2、颜色 AdjustColor(DeepColor, 0.2, 0.2)。玩家控制（State.isRTSMode）：线宽 ×2、z −0.25、AdjustColor(DeepColor, 0.3, 0.3)。选中：线宽 ×2、z −0.3、选中色 |
| ColorUtils.AdjustColor | 0x83EDE0 | RGB→HSV，S = clamp(S + a)，V = clamp(V − b)，HSV→RGB |
| MaterialManager.UpdateStateColor | 0x3EDEE0 | DeepColor = AdjustColor(color, 0.1, 0.05)；ShallowColor = AdjustColor(color, −0.05, −0.05) |

场景序列化（StateLineRenderer#31729）：stateLineThickness 0.25 世界单位，等于 1.667 地图单位。海岸线 z −0.25，比普通国界（z −0.2）更靠前，所以海岸段国界被海岸线盖住。

`PathUtility.BuildSmoothPath`（curveAmount 0.5、interpolationPoints 5）属于河流路径，不用于国界。这项此前已在 fms-river-shape-v5 中恢复。

## 海洋 SDF 源线

StateLineRenderer.ProcessPendingCoastLines 为每条平滑海岸线另建一条 SDF 用折线：线宽 shallowLineThickness（场景值 1.2 世界单位，约 8 地图单位）、Geometry 1、OffsetInner = s·(−0.1)、OffsetOuter = s·0.1（s = 2·方向 − 1）、专用 layer（SDF 相机）。随后 UpdateSDF 刷新 SDF。

## 推断与未知

- SDF 相机的 alpha 来源、阈值与正负号，以及自定义 Shapes 字段 offsetInner/Outer 的确切含义，都没有逐点恢复。网页把“海水距离”取为到平滑海岸曲线的距离减去半带宽 4 地图单位，这是**静态推断**；带的 ±0.1 侧移暂不采用。
- 原作国界画的是每个国家的完整周界（包括海岸段）。网页只画两国相邻的陆上边，见 RESULT.md 的适配说明。
- RemoveDuplicatePoints 的比较方式未反汇编；网页沿用 SmoothBorderLines 的 0.001 去重。两条路径都基于同一个 CurveBasis(·,4)。
