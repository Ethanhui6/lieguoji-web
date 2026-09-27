# Preview 10 近岸方形明暗：只读定位

2026-09-27。依据当前生产代码与 `natural-repair-checks/desktop-first/artifacts/atlas-add-detail-coast--de-20e0a-eload-and-overlap-rejection-desktop-chromium/restored-coast-close.png`；本次没有运行测试、浏览器或性能测量。

## 结论

直接来源是 **2 world 细三角片的常量坡向光照**。不是将一个粗地块颜色放大，也不是节点数据页 nearest 过滤本身。最终高度是连续的分片线性场，但当前显示把其分片常量导数变成整片明暗；邻片导数可跳变。海底高度近似可分离时，同一细格两个三角的坡向一致，因此表现为方块而不只是三角。

截图 1125% 对应 11.25 CSS px/world，2 world 细格约 22.5 px，吻合可见明暗块；256 粗世界的 16 world 间距则约 180 px。尺度吻合属于图像与代码的对应证据，不是逐像素还原这份存档的数值测量。

## 确切路径

- `detail-coast-field.ts:10–18`：显式细节点使用已存整数米；缺失海 tile 与 uniform land tile 使用连续 compact-IDW Hbase，之后整数米取整。基础场由 `generation/detail-shape-height.ts` 的真实粗重心、2.5 个粗间距支持半径重建，名义 bucket 只加速查询。粗采样与整数米量化确实仍限制实际高度精度，但并非一格只输出一个颜色。
- `detail-terrain-pages.ts` 将每个 2 world 节点的 coverage/height 各自编码为 signed16，组成 RGBA8；`detail-terrain-backend.ts:159` 的 nearest 是必要的数值传输约束。
- `detail-terrain-shader.ts:81–85,136–147,195–202` 用 texelFetch 读四个节点，执行实际 Q8 clip 和固定 NW–SE 三角划分，逐像素重心插值 height；随后由同一片三个顶点求常量 gradient。
- `detail-terrain-shader.ts:180–187` 把 `(gx+gy)/40` 经 atan 映射到 0.87–1.13 光照，再查海/陆各自 LUT。这个常量 light 在相邻片边界可能不同，即使边上 height 完全相同。整数米量化进一步放大细步长的坡度变化，但修复不需要改存档高度。
- `terrain-mesh.ts:35–42` 的海陆分离 LUT 已 linear、clamp-to-edge、半 texel UV；它只在颜色表里插值，不能消除空间中的 light 跳变。把 RGBA 编码数据页改 linear 会破坏数值，不能采用。
- `render-density.ts:30–54` 根据实际屏幕密度向上取幂并在既有预算内划分显示核心；`renderer.ts:278` 在对应密度逐像素跑 shader。缓存单位不是 2 world，且缓存不会为每个细格选择一个颜色。没有本张截图的完整 raster metrics，故不声称已量测其 fallback 值；源码已足以定位上述确定存在的细片光照接缝。

一个解析反例即可说明机制：相邻两个 2×2 world 海格高度分别为左格 NW/NE/SW/SE = -100/-80/-80/-60，右格 = -80/-80/-60/-60。共享边 height 相同；左格两片 gradient=(10,10)，右格两片=(0,10)，光照分别约 1.0384 与 1.0203。高度没有断层，画面却有约 1.8% 的整格亮度阶跃。这是公式例子，不冒称截图实际节点值。

## 下一批最小改动

只修改 v4 shader 的显示光照及其窄测试，保留精确 mask/height/pick、clip 顺序、量化交点、诊断高度、原始页格式和资源预算。以全局共享源节点构造海/陆同侧的有界光照，再给规范边上的裁切交点一致的同侧值，最后在现有实际三角内插值光照。遇异号邻点只读本侧至实际量化零线的高度，不能跨岸混合高度或颜色。预计每片读四个已有角点及八个轴向外邻点，共 12 个唯一节点，无新全图场或纹理页。

每个源节点/规范交点的光照须与 cell/fan/mesh origin 无关；共享边两边使用完全相同的端点值，因此同一海陆侧 C0 连续。它是显示法线/光照重建，不是修改权威几何。当前解析 piece-gradient 仍可保留作为真实高度导数检查，但不再要求显示光照等于分片常量导数。

必要验算：实际共享边与三角对角线两侧的颜色连续；混合岸边不跨侧影响；1-Q8 薄片、孤立零点/零边与四世界边界有效；平面坡向与平地保持正确；实际 GPU diagnostic mask/height 与原 CPU pick 一致；跨 Mesh origin/页地址/缓存核心无接缝；同一真实存档 1125% 截图复核。先窄单元与实际 GPU 路径，再看真实图；测试源码落盘不等于通过。

仍然未解决：16 world 粗 Hbase 的内陆分辨率、真实地貌是否达到用户审美、真手机验收。连续显示光照不能被记作增加地理细节或 PH06 整体验收通过。
