# 原作 B 样条海岸墨线恢复（2026-10-17）

实现提交 **8e69084**（海岸线）、**730dae0**（冻结上一引擎 96c3 并作为检查产物源码），分支 codex/ph06-world-generation。检查产物 `.autopilot/fms-coastline47-checked`，build.json 绑定 730dae0，新 culture47 引擎 `d4f020333d1a4bf9883074eb49a5cee0dfc9c9e570bf25c46d529d9e635ab037`。本机入口 **http://127.0.0.1:5338/?fms=1**（仅127.0.0.1，会话结束后不保证仍在运行）；旧产物 5337 保留作对照。

## 为什么不是直接接入已有“轮廓平滑”

先在默认整图（1337 种子 continents）上实测已有 `bounded-coast-relaxation-v2`：最大偏移 1.54 地图单位、折角能量只降约 2.3%、耗时约 1.9 秒。采样间距 8 单位，几乎看不出改善，因此没有作为本批交付。

## 原作依据（只读静态恢复，见 ORIGINAL_COASTLINE.md）

- `BorderDataProcessor.UpdateCoastLine` 把一侧低于海平面、另一侧不低于海平面的可见 Voronoi 边串成链，再调 `BorderCalculationHelper.SmoothBorderLines`。
- `SmoothBorderLines` 对每条链调用 `MathUtility.CurveBasis(points, 4)`：均匀三次 B 样条，每段 4 等分；首尾逐分量差 <0.001 走 `CurveBasisClosed`；之后去掉与前一点逐分量差 <0.001 的内部点（`Vector3Extensions.NearlyEqual`）。
- `StateLineRenderer.ProcessPendingCoastLines` 用 Shapes Polyline 画可见海岸线：不透明、`thickness = coastLineThickness`、颜色 `World.coastLineColor`。场景序列化 `coastLineThickness = 0.25`（Polyline 预制件 thicknessSpace = Meters，即世界单位）。
- `World.Start → SetResolution(1600, 900)`：地图四边形 240 世界单位宽，1 地图单位 = 0.15 世界单位，海岸线宽 = **1.667 地图单位**，随缩放同比变化。
- 显示预设中羊皮纸预设 0/3/7 的 coastLineColor 都是 **#5f5f5f**（0.3725 灰）。
- 第二条线（`shallowLineThickness = 1.2`，带内外偏移、专用 layer）是 SDF 相机的源线，用于海洋渐变，不是可见线。

## 网页实现与适配边界

- 新 `src/fms/coast-curve.ts`：`fmsBasis / fmsCurveBasis / fmsCurveBasisClosed / fmsSmoothBorderLines` 按编译 SSE 顺序用 Float32 实现（证据级别：**静态恢复 + 单测**，未与原进程逐点联调）。
- **桥接**：输入是网页实际渲染的 h20 三角交线（端点按共享边规范化，可精确串链），不是原作的 Voronoi 格边。
- **适配**：原作 Joins = Simple，网页用圆角避免 Pixi 折线缝隙；墨线在国家填色之上、标记/地名/部队之下。
- 纯显示：陆地判定、拾取、模拟、存档、Worker 规则均不变。填色仍按线性插值边界，在急弯处可能略超出墨线——原作 Voronoi 填色与平滑线也是同样关系。
- 网页 40 倍超过原作序列化的相机范围（PlayerController ZoomMin = 5，候选解释为正交尺寸，约可见 66 地图单位高），所以 40 倍时线宽约 37 像素，比原作最大放大时粗；16 倍及以下在原作范围内。

## 同视角对照

同一合成整图（36,864 点、6 国 60 城）、开局 tick 0 不推进、点“显示全图”后在屏幕 (455,395) 连续滚轮缩放；新旧构建相机投影完全一致（results.json）。

| 倍率 | 旧 | 新 |
|---|---|---|
| 全景 | [before/zoom-1.png](before/zoom-1.png) | [after/zoom-1.png](after/zoom-1.png) |
| 4× | [before/zoom-4.png](before/zoom-4.png) | [after/zoom-4.png](after/zoom-4.png) |
| 16× | [before/zoom-16.png](before/zoom-16.png) | [after/zoom-16.png](after/zoom-16.png) |
| 40× | [before/zoom-40.png](before/zoom-40.png) | [after/zoom-40.png](after/zoom-40.png) |

该图 4,011 段交线 → 300 条链 → 14,663 个曲线点。竖屏手机尺寸见 [mobile/portrait-coastline.png](mobile/portrait-coastline.png)（Chromium 仿真，不是真机）。

## 检查

- 单测 3 文件 22 项（新海岸曲线 6 项、海洋交线、32 项冻结引擎登记）；全仓 lint、typecheck、生产构建通过，产物审查 98 个允许产物。
- 浏览器（GAME_BASE_URL=5338、GAME_BUILD_DIR 绑定检查产物）桌面 **4/4**：新海岸线（数据集、保存后冷恢复一致、无页面错误）、`engine-96c3.js` 原引擎继续/保存/恢复、回包管线 pending 预览/保存、连续行军与暂停点选；手机尺寸海岸线 1/1。
- 上一引擎 96c3 原 Worker 冻结：1,413,669 字节，SHA256 `59017af33ebb5aee450ec28f6dea3aed754cfdf80b8d604935869defe8f0ae58`，与上批服务实测字节相同；用旧版创建的存档继续按原规则运行。

## 未完成

- 海洋 SDF 渐变仍取线性交线，原作取平滑源线（偏移 ±0.1、宽 1.2）——下一批可改。
- 国界线 (`stateLineThickness 0.25`、`curveAmount 0.5`、`interpolationPoints 5`) 尚未按原作平滑；`shallowLines` 用途未知。
- 未跑完整测试套件，没有真机/用户视觉验收；持续 4× 吞吐仍未达标。

没有 push、PR/Issue/Milestone、Pages/Cloudflare、main、原安装目录或个人存档写入。
