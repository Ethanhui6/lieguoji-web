# 原作格网 + 原作画法地图（移植第一阶段首批，2026-10-17）

移植分析见 [FMS_PORT_ANALYSIS_2026-10-17.md](../../FMS_PORT_ANALYSIS_2026-10-17.md)。实现 35a83b2，冻结上一引擎 f2b7 后源码 5806ae6；检查产物 `.autopilot/fms-original-map-checked`，本机 **http://127.0.0.1:5351/?original=1**（仅本机，会话后需重启）。可玩世界仍在原来的入口 `?fms=1`，本批没有改它。

## 新恢复的原作依据（只读静态）

- **内置地图格式**：AES-256-CBC（零 IV）→ Base64 → GZip → JSON，含 CellData 每格数组与 State/Province/Army/War/Diplomacy/Time 等全部存档段。密钥只在本机私有目录使用。
- **原作格网**：四张 BasicMap 都是 1600×900 Azgaar 抖动格网，期望 2万/3万/4万/8万格 → 188×106、231×130、267×150、377×212，每个点都逐一核对过。
- **时间**：`TimeManagerData.SecondsPerDay = 0.1`，1 倍速 = 每秒 10 游戏日。
- **羊皮纸**：level0 `PachmentMaterial` → `Custom/ParchmentEffect`（sharedassets0 #187）。编译片元：`c = m + strength·(p·m·ParchmentColor − m)`（或灰度变体），再做亮度/饱和度；场景值使整帧乘以 `parchmentfinal2`，在世界坐标中铺 249.3×137.2。
- **陆地显示**：Shader189 模式 1（UseHeightMapBackground，原作默认）输出 `1 − h/100` 灰度；模式 2 为高度编辑配色。
- **相机**：PlayerController ZoomMin 5（推断为正交半高），最近约可见 66.7 地图单位高。

## 网页实现

`src/fms/original/`：原作格网数据、Voronoi 格子与裁剪边邻接、按原作逐格纯色网格、SDF 海面、原作海岸 B 样条（输入为原作同款的陆/海格边）、羊皮纸相乘、8 个显示预设。预览页可切格网、模板、种子、预设、陆地模式。羊皮纸为 2048² JPEG（由原贴图缩小），在产物审查中按精确哈希登记。

## 截图

| | |
|---|---|
| 预设1（蓝海+羊皮纸，原作默认色） | [p1-full.png](p1-full.png) |
| 原作最大放大 | [p1-zoom.png](p1-zoom.png) |
| 预设8（白海+羊皮纸） | [p8-full.png](p8-full.png) |
| 高度编辑配色 | [palette-full.png](palette-full.png) |
| 4 万格 | [g40-full.png](g40-full.png) |
| 手机竖屏尺寸（仿真） | [mobile-full.png](mobile-full.png) |

## 检查

单测 3 文件 16 项（格网形状/逐点核对/邻接对称/模板可重复/预设/羊皮纸矩形/灰度/海色）；lint、typecheck、生产构建、产物审查 113 项通过；浏览器 2/2（f2b7 原引擎继续、海岸线流程）；plan、15 项 plan 测试、24 项发布策略测试通过。f2b7 冻结 1,413,669 字节。未跑完整套件，无真机/用户视觉验收。

## 未完成

国家/城市/地貌在原作格网上的显示；可玩世界迁到原作格网与渲染；原作界面；按原作分批调度的模拟速度。
