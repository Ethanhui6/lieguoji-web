# 原生版 0.27.1（build 75）

仅改 `ios-native/`，不改网页引擎。分支 `cursor/native-batch-027-4469`。手动跑 **iOS unsigned IPA** 打包验收。

## 本版要点

- 国家面板概览 + NavigationStack 下钻；人物一行摘要 → 详情 → 编辑。
- 城市三类标记屏幕可读；省界默认开；选中省府城高亮；绘制疆域国界加粗。
- 开场动画与生成进场时间线重做；新世界整页选项经 `TerrainShaping` / 本机后处理生效。
- 海洋预设 0：浅海外缘、海岸渐变；数值控件滑条＋加减。
- ShotTour 扩展验收截图；见根目录 CHANGELOG 0.27.1。

## 已知限制

- 地图网格尺寸不可调（原作 20k）。
- 网页 `generate` 不识别 startYear／navy／religion 种数；本机接管后改写。
- 改革家／船舶大师仍为 iOS 独有「（简化）」效果。
