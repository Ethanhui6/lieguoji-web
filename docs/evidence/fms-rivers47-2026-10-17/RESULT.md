# 原作格网上的原作河流（2026-10-17）

实现提交 **9b6c2a2**（河流），冻结 **09424e7**（f8e2，即 5352 上的可玩构建）与 **93d338e**（417e，上一会话 5353 上的测速构建）；分支 codex/ph06-world-generation，仅本地提交。检查产物 `.autopilot/fms-rivers47-checked`，build.json 绑定 93d338e，新 culture47 引擎 `d7e73e161a50762e7f004c30799cd213383faeeedcf0c0cbb7f7b27dcb6165c1`。本机入口 **http://127.0.0.1:5354/?fms=1**（仅 127.0.0.1，会话结束后需重启）。5352（f8e2）与 5353（417e）是上一会话起的服务，未改动。

只改显示：模拟、存档、点选不变。旧方形网格世界不受影响。

## 原作依据

| 环节 | 原作 | 网页 |
|---|---|---|
| 降水 | 内嵌 `main.mjs` 气候在格网上按行列计算 | 原作格网本身就是行优先的 `cellsX × cellsY`，直接在原作格上运行已恢复的格网气候，不再重采样 |
| 河流生成 | `Rivers.generate`：填洼、流量累积（格数修正写死 40000）、≥30 成河、强支流接管、少于 3 项淘汰 | 沿用已恢复的实现，改为直接返回原作的已接受路径（含合流点、海口或出图 −1） |
| 取点 | `getRiverPoints`：陆格取格点；入海处取 `World.GetSharedEdgeMid`（两格 Voronoi 公共边中点）；出图取 `getBorderPoint` | 同上，公共边来自原作格网 |
| 弯曲 | `addMeandering`：陆地源 step 从 10 起，间距 ≤5 且河长 ≥6 跳过，否则插一个偏移中点 | 逐行移植（含 step<10 分支） |
| 曲线 | `BuildRiverPath` 0x4E5840：切线 = normalize(后−前)，柄长 = 段长 × 0.5 | 沿用已恢复规则 |
| 采样数 | `CalculateInterpolationPoints` 0x4E5FF0：clamp(Math.Round(长度+6), 6, 12)，长度是世界坐标 | 改为世界长度（地图长度 × 0.15）和银行家舍入；之前误用地图长度 |
| 线宽 | `DrawSingleRiver` 0x4E97B0 实例化 `Prefab/TradeLine`：Shapes Polyline，线宽 0.125 世界单位（Meters），不透明，圆角；第 i 点乘 (0.7 + i·0.7/N)·1.5 | 0.125 世界单位 = 0.833 地图单位，源头 0.875、河口近 1.75 地图单位；之前误把 1 宽度单位当 1 地图单位 |
| 颜色 | `World.riverColor`（level0 World#44231 首字段）= (0.0305, 0.8741, 0.9245) | 同值，之后与其他层一起乘羊皮纸 |
| 层次 | 河流 z −0.19，在国界（−0.2）与海岸线（−0.25）之下 | 画在逐格陆地之上、国界和海岸墨线之下 |

新恢复的事实（预制件名、线宽、颜色字段与值、z）来自本批只读 UnityPy/Capstone 分析，原始数据留在被忽略的 `.autopilot/fms-audit/binary/coastline-static/`。

## 同视角对照

同一默认整图（原作 2 万格、continents、种子 1337），建国后 tick 0 不推进，显示全图后在画面中心连续滚轮缩放；旧（5352，f8e2）与新（5354，d7e7）相机完全一致（results.json）。

| 倍率 | 旧 | 新 |
|---|---|---|
| 全景 | [before/zoom-1.png](before/zoom-1.png) | [after/zoom-1.png](after/zoom-1.png) |
| 4× | [before/zoom-4.png](before/zoom-4.png) | [after/zoom-4.png](after/zoom-4.png) |
| 12× | [before/zoom-12.png](before/zoom-12.png) | [after/zoom-12.png](after/zoom-12.png) |

竖屏 430×932：[portrait/zoom-12.png](portrait/zoom-12.png)（Chromium 仿真，不是真机）。该图 292 条河、17,923 个曲线点、35,262 个三角形。

同机 Node 实测：20k 格 continents/pangea 生成 50–66 ms、几何 73–81 ms；40k 格约 100–114 ms + 155–171 ms。只在打开世界时算一次。

## 检查

- 单测 8 文件 47 项：.NET 舍入、世界长度采样、TradeLine 线宽渐变、原作格上河流从陆地起源、入海口落在公共边中点、确定性；以及气候、河流、地貌和 37 项冻结引擎登记。气候保护上限从 192 列放宽到 512 列，让原作 3 万/4 万格网（230/266 列）也能用；更新了该保护的测试。
- 全仓 lint、typecheck、生产构建通过，产物审查 116 项。
- 浏览器（GAME_BASE_URL=5354，GAME_BUILD_DIR 绑定检查产物）桌面 **8/8**：海岸线、`engine-f8e2.js` 与 `engine-417e.js` 原引擎继续/保存/恢复、纸色海、回包管线、整图取消/撤销/重做/刷新、默认整图建国并推进（新增断言：原作渲染器且河流 >20 条）、连续行军。手机尺寸的默认整图建国用例 1/1。
- plan、15 项 plan 测试、24 项发布策略测试见 verification.json。

## 未完成

- 原作还有 `addMeandering` 产生的 flux 宽度元数据（未传给 Unity，未使用）与湖泊；网页没有湖泊。
- 编辑器里的原作格网仍用旧三角渲染与旧河带。
- 地貌色（模式 0）、城市图标、地图字体、按原作分批调度的模拟速度和原作界面仍待做。
- 未跑完整测试套件，没有真机或用户视觉验收。

没有 push、PR/Issue/Milestone、Pages/Cloudflare、main、原安装目录或个人存档写入。
