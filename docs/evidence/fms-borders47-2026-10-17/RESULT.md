# 原作国界描边与平滑海岸海洋渐变（2026-10-17）

实现提交 **52910cb**（国界描边 + 海洋带距离）、**c28ec7a**（冻结 d4f0）、**358a0ee**（海岸段国界交给海岸线），分支 codex/ph06-world-generation，均为本地提交。最终检查产物 `.autopilot/fms-borders47-checked`，build.json 绑定 358a0ee，新 culture47 引擎 `f2b7865d7890e40d4ceb9e8e5ffd3df7f2f9932987fd86346df3f8f57d34c11c`。本机入口 **http://127.0.0.1:5340/?fms=1**（仅 127.0.0.1，会话结束后需重启）。对照的上一版 5338（d4f0）保留。

只改显示：陆地判定、拾取、模拟、Worker 规则和存档都没变。原作恢复依据见 [ORIGINAL_BORDERS.md](ORIGINAL_BORDERS.md)。

## 改了什么

1. **国界（政区视图）**：原作在 `UpdateStateLine` 里把国界点交给 `SmoothBorderLines`，也就是与海岸线相同的 `CurveBasis(points,4)`；`SetStateLines` 再按 `stateLineThickness` 0.25 世界单位（1.667 地图单位）描边。颜色取 `AdjustColor(DeepColor, +0.2, −0.2)`，其中 `DeepColor = AdjustColor(color, +0.1, −0.05)`。网页新增 [state-line.ts](../../../src/fms/state-line.ts)：把相邻两国的省份多边形公共边串链、套用原作曲线，画在国家填色之上、海岸线之下。原来的“浅色光晕 + 深色直折线”被替换。地形视图和旧入口 FmsGame 保持原样（按需启用）。
2. **海洋渐变**：原作 SDF 相机用的是围绕平滑海岸曲线、宽 1.2 世界单位的源线带。网页的距离场改为：到同一条平滑曲线的距离减去半带宽 4 地图单位，带内为最浅色，原有 cap、平滑插值与配色不变。合同名 `recovered-shader191-smoothed-coast-band-distance-v3`。带宽减法属于静态推断，带的 ±0.1 侧移方向未恢复。

## 与原作的已知差异（适配）

- **海岸段不画国界**：原作描的是每国完整周界，但海岸段与海岸线来自同一批格边、同一条曲线，并被 z 更靠前的海岸线盖住。网页的省份多边形和真实海陆分界不重合，第一次构建（f1f6，仅本机检查用）把这些边画到了海上，所以最终只画两国相邻的陆上边。中间失败画面的日志保留在 intermediate/。
- 两国公共边各自描一次，后画的覆盖先画的；原作同为 z −0.2，覆盖顺序同样不确定。
- 尚未实现玩家控制国 2 倍线宽，以及选中国家的原作描边（网页仍是选中省份黄框）。

## 同视角对照

同一合成整图、开局 tick 0 不推进、显示全图后在固定屏幕点连续滚轮缩放。旧（5338，d4f0）与新（5340，f2b7）相机投影完全一致（各目录 results.json）。

| 视角 | 旧 | 新 |
|---|---|---|
| 陆上国界 4× | [border-before/zoom-4.png](border-before/zoom-4.png) | [border-after/zoom-4.png](border-after/zoom-4.png) |
| 陆上国界 16× | [border-before/zoom-16.png](border-before/zoom-16.png) | [border-after/zoom-16.png](border-after/zoom-16.png) |
| 海岸 16× | [coast-before/zoom-16.png](coast-before/zoom-16.png) | [coast-after/zoom-16.png](coast-after/zoom-16.png) |

另有两组的 1/40 倍图、竖屏 [mobile/portrait.png](mobile/portrait.png)（Chromium 手机尺寸仿真，不是真机）。羊皮纸海的深浅两色接近，所以海洋渐变的变化在画面上较轻微。

默认整图（1337 种子 continents）上，距离源从 4,011 段直线交线变为 14,363 段曲线段；512² 距离场构建约 70–98 ms → 88–108 ms，曲线推导另需约 28–37 ms（同机单次观察，不作性能承诺）。

## 检查

- 单测 6 文件 33 项：国界颜色、陆上边筛选、带距离、曲线距离源、33 项冻结引擎登记等。全仓 lint、typecheck、生产构建通过，产物审查 99 个允许产物。
- 浏览器（GAME_BASE_URL=5340、GAME_BUILD_DIR 绑定最终产物）桌面 **5/5**：海岸线与国界诊断（保存后冷恢复一致、海洋合同名）、`engine-d4f0.js` 原引擎继续/保存/恢复、羊皮纸海与编辑器海洋数据一致、回包管线、连续行军。手机尺寸海岸线/国界 1/1。
- 中间构建上第一次跑海岸线用例失败：失败的是我新加的一条错误断言（编辑器画布仍在页面中），已删除，日志在 intermediate/。
- 上一引擎 d4f0 原 Worker 已冻结：1,413,669 字节，SHA256 `ced2cd900b374e3620afb7ce8d81fab1db79e28fa1e5dfbdcd9c5cfe4663a2c9`。中间引擎 f1f6 只在本机 5339 跑过我的检查，没有公开为试玩入口，已停止服务，未冻结。

## 未完成

- 网页省份多边形仍有超出海岸的小块（海边黄绿色块），属于原有的区划几何问题，需另行处理。
- 玩家国 2 倍国界、原作选中国界；`shallowLines` 用途未知。
- 没有跑完整测试套件，没有真机或用户视觉验收；持续 4× 吞吐仍未达标。

没有 push、PR/Issue/Milestone、Pages/Cloudflare、main、原安装目录或个人存档写入。
