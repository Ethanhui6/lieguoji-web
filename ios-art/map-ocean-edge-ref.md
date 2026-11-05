# 海洋边缘参考（ORIGINAL_PRESETS[0]）

原生 Metal 地图外缘与海岸浅水应对齐原作海洋预设 0，避免纯色深青边框与糊边。

## 颜色

| 用途 | 色值 | 说明 |
|------|------|------|
| 浅海 / 海岸 | `#3C9CFF` | `MapPalette.displayShallowSea`；MTKView clearColor 与此一致 |
| 深海 | `#1487FF` | `MapPalette.displayDeepSea` |
| 海岸提亮 | `#6BB8FF` | 着色器在浅海端再混一点，形成岸边浅水带 |
| 烘焙纸海（仅资源） | `#8EAFB1` / `#527C86` | world.bin 仍用纸色；屏幕由 `textureFragment` 重映射 |

## 行为要求

1. 地图外的 letterbox 用浅海色，不要用深海平板色。
2. 海岸距离纹理重映射时用 softstep，不要硬切。
3. 允许轻微 procedural ripple；不要另起配色体系。
4. 卷轴暗角（`scrollFrame`）叠在地图上，不替代海色。
