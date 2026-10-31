# 阶段 2 记录：原生地图

分支 `claude/native-map`（基于 main 27253d93）。原生版 0.2.0。路线不变：游戏规则全部用 Swift 重写，不嵌 WebView 或 JavaScriptCore（PORTING.md）。

## 本阶段内容
- **地图资源**：`src/native-export/world-export.test.ts` 只读 src，导出一个真实世界到 `ios-native/Resources/World`：原作 20k 格网（19928 格、119004 顶点、59219 条共享边）、种子 421730 大陆模板、culture47 开局第 0 日的 8 国 80 省 80 城。`world.bin` 小端二进制（格式写在导出脚本头部），`world.json` 为省/国/城与来源文件 SHA-256。重新导出：`EXPORT_NATIVE_WORLD=1 npx vitest run src/native-export/world-export.test.ts`（普通测试会跳过）。
- **Core（纯 Swift，Linux 可测）**：`WorldMap` 解码与损坏检测；`MapCamera` 屏幕/地图坐标、锚点缩放、铺满/适配、边界夹紧、对数插值；`MapPalette` 原作第一套显示预设（高度灰底 + 国家色 0.8 线性混合，地形视图用原作逐格生态色，海由浅到深）；`CellMesh` 扇形三角化；`BorderMesh` 沿共享 Voronoi 边分省界/国界/海岸线；`CellPicker` 网格桶 + 点在多边形内的精确拾取。单测用真实导出数据核对 TypeScript 端的计数和首条边。
- **Render（Metal）**：几何一次上传，颜色只在模式/选中变化时重建；线段在顶点着色器按固定屏幕宽度展开；4× MSAA；按需重绘（静止时不绘制）。
- **手势（UIKit）**：单指拖动带惯性、双指捏合（以手指为中心，同时可拖动）、双击放大、双指轻点缩小、单击选省（选中触感）；任何新触摸立即停下惯性或镜头动画。
- **界面（SwiftUI）**：地图全屏铺满；顶部材质胶囊与圆形浮动按钮（地图模式菜单、国家列表），右下回到全图与说明；省份面板为系统底部 sheet（230pt / 中 / 大三档，中档以下地图仍可操作）；国家列表点按后镜头飞到首都并选中该省。国名随地图缩放，城市名放大后出现。

## 未做（诚实列出）
- 没有时间推进与任何游戏规则；地图是开局静态状态。
- 没有河流、山林装饰、羊皮纸质感，国名未做原作的倾斜排布与碰撞剔除。
- 帧时间叠层只记录按需重绘的间隔，不是 GPU 耗时；未在真机测 120Hz。

## 验证
- 本地（Windows）无法编译 Swift，依赖 GitHub Actions：Linux Core 单测 + macOS archive + 未签名 IPA。结果见下方运行记录。
