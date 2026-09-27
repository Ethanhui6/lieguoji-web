# 海洋材质下一批建议（只读定位，尚未实现）

2026-09-28。范围仅为地图海洋的显示材质；不是自然海域、自然大陆或 PH06 验收通过。已读实际生产代码并用 view_image 查看 preview20 归档图；本轮没有改 src/tests/scripts、运行检查、启动 GPU/浏览器或写云端。

## 可复核的观察与来源

preview20 构建：`0.5.0-preview.20`，`build.json` SHA256 `71c67dd44b5b1c3a8f75ec59cbeeea4e07c96432aa9ad0bc0179403d4999e018`。构建证据在 `docs/evidence/ph06-fine-world-relief-2026-09-28/`；其 `visual-review.json` / preview20 历史归档的 `original-visual-review.json` 仍明确自然视觉、用户视觉、真机和整 PH 未通过。本次亲自查看：

- `browser/desktop/artifacts/atlas-add-detail-coast--de-20e0a-eload-and-overlap-rejection-desktop-chromium/second-continent-preview.png`：20% 全图，两陆周围有连续高亮青蓝轮廓，远海有很宽的缓变明暗。
- 同目录 `restored-coast-close.png`：1135% 近岸，浅水是较宽的亮青色渐变面，紧贴真实岸线；可见细岸折线和淡色三角坡面。黄色框是选中模拟格，不是岸线。
- `browser/mobile/artifacts/atlas-add-detail-coast--de-20e0a-eload-and-overlap-rejection-mobile-chromium/saved-mountain-mid.png`：手机仿真 72%，青蓝浅水带沿几乎整圈岸线连续出现，海底明暗加重柔软塑料感。该图不是新一轮浏览器执行，也不是真机。

这三图是 preview20 旧几何基线。主线当前正集成 regional-coast；不能拿新生成轮廓和这组旧图直接做材质 A/B、把轮廓差异算成材质改善。

## 确切代码路径和原因

| 实际模块 / 位置 | 当前行为 | 与画面关系 |
| --- | --- | --- |
| `src/world/terrain-material.ts:3`，`sea` 与 `atlasElevationColor` | 海深锚点：-12000 `#10283f`；-5000 `#12354d`；-2000 `#1b5269`；-600 `#28798d`；-100 `#4c97a8`；-1 `#79bac0`；锚点间按高度连续插值 | 接近零米的浅水 RGB 为 121/186/192，显著高于深海，形成整圈亮青带。主要来源是物理水深色表，不是随机涂色或 bloom。 |
| 同文件 `atlasTerrainColor`；`src/world/terrain-mesh.ts:22`，`terrainMaterialTable` | 物理坡向产生原始 light；陆地与海洋最终均直接乘同一 `.87..1.13` 光照范围 | 海床起伏使用与陆地相同的强度；浅水最亮可近 137/210/217，让海像被侧光照射的实体塑料面。 |
| `src/world/detail-terrain-shader.ts`，`nodeLight` / `nodeLights` / `writeResult` | `atan((gx+gy)/40)/(π/2)`，乘 `.13`；在同侧节点光照间连续重建；高度仍是规范 Q8 裁切片真实高度。海表查 `uDetailSeaLut`，高程归一到 -12000..0，light 归一 `.87..1.13` | v4 的 GPU 使用真实海床坡向，不是海浪法线。没有镜面、泡沫或装饰波纹；不应通过改地理高度来解决颜色问题。 |
| `src/world/terrain-mesh.ts:9–11,22–43` | 1201×33，海陆各一张 RGBA8、线性过滤、无 mipmap、不透明 LUT；10 米一列；海表最后一列用负 epsilon 保证零高程边界仍为海域色表 | 近零颜色属于浅海而非混入陆地；十米 LUT 精度与真实 2-world 地理节点精度是不同限制。 |
| `src/world/renderer.ts:245–255` 与后续旧地表分支 | v4 走 `detail.createMesh`；旧分支才画 `#c5dcc7`、`step/24`、alpha `.7` 的 shore stroke | 不能通过删除旧分支 shore stroke 修复 preview20 的亮圈；v4 没走该画线代码。背景 `#10283f` 也不是亮圈来源。 |
| `src/world/generation/detail-natural-relief.ts:171–182` | `shelfBase=min(112,shelf)`；固定世界坐标 512-world 低频改变实际陆架宽度，约 `0.35..1 × shelfBase`；海高程是 `oldSea * smoothQ(distance/shelfWidthAt)`，范围 -12000..-1 | 全岸都经过平滑浅海坡，因此色表高亮区广泛沿岸出现；这是已有实际海床生成的结构。本批只调材质，不能宣称解决了海床结构单一。 |
| `src/world/generation/natural-ocean-base.ts` | 原始海盆围绕 3800 米；范围 1200..6500 米；2048/1024/768-world 三个低频成分写入真实海床 | 远海缓变来自已生成数据；不能用新装饰噪声、海浪或假等深线替代这份数据。 |

本轮 `git diff 4b387f95 --` 核实以上 renderer、material、mesh、shader、natural-relief 均无生产差异。当前原字节 SHA256：

- terrain-material：`caab5e9e52b406b7e0d34f802a010e12f00046e59781bb999f5ca1629f150045`
- terrain-mesh：`a58f5d37bf0c016b745d74c4bdda5e4ff30c3f889574d20323d464ff8a2cc5dc`（实施前应重新计算原字节，不把本文当运行时身份。）
- detail-terrain-shader：`6dc8017930eac3fcbac210e5c025538a36c53b32878b594ef43f43b3a63209cb`
- renderer：`7999dc1076f85aaadf64073d009325ee676bf18734dcdd20eb22aaad0d7e000a`
- detail-natural-relief：`83cf27c58cd38bbfbe01e7c2487416cc219b21366d07895302b0b7fc72c5851a`

## 最小实现：一项材质改动，一项受影响验证

建议首先只做连续深度色表与海床光照响应，复用全部现有地理/坡向查询，不扩展 shader 采样结构。以下是待视觉比较的首版数值，不是已验收调色：

| 水深锚点（米） | 建议 RGB | 用途 |
| --- | --- | --- |
| -12000 | `#10283f`（保留） | 深海底色，与画布背景协调 |
| -5000 | `#12354d`（保留） | 保留深海差别 |
| -2000 | `#1b4c61` | 海盆到陆坡的中间层 |
| -600 | `#2c6170` | 陆坡的深度差别，降低亮青色占比 |
| -100 | `#41777e` | 浅海与深海可区分，减少荧光感 |
| -1 / 海表零边界 | `#618d8b` | 有限亮度的近岸水色，仍与陆地零米 `#b2b585` 分离 |

1. **`terrain-material.ts`**：更新 sea 锚点；提取一个纯材质函数，输入实际 `height`、现有原始 `light`、显式 `domain`，输出 RGB。陆地保持原式逐字节相同。海洋采用 `1 + (rawLight - 1) * gain(depth)`，gain 连续插值：0 米 `.20`、600 米 `.35`、5000 米 `.12`、12000 米 `.12`。其最大明暗幅度分别约 ±2.6%、±4.55%、±1.56%，保留真实海床坡向但降低实体侧光感。`atlasTerrainColor` 调同一纯函数，避免 CPU 路径与 LUT 各写一套光照。上述“深度衰减”是显示设计，不是声称完成光学水体模拟。
2. **`terrain-mesh.ts`**：`terrainMaterialTable` 调同一纯函数。保持 LUT 1201×33、全部 alpha=255、分离海陆端点、原线性 height/light UV、纹理数与共享像素账不变；只在 LUT 生成时做新响应。增加显示用材质版本常量并更新 shared cache key（当前 `terrain-surface-lut-v1/${domain}`）。**不要**同时在 shader 中再次压缩 light，否则会双重衰减。
3. **`renderer.ts`**：将上述材质版本纳入 `specFor` 的显示纹理 key，避免旧缓存与新 LUT 意图不一致；不改变世界坐标、density、裁切、几何缓存依赖、选中框或预算。材质常量不进入世界存档。

这三个运行时模块构成最小改动。`detail-terrain-shader.ts`、`detail-terrain-backend.ts`、地理生成器、codec、拾取与存储本批应保持原字节：12 个唯一节点读取、7 个纹理采样器、5 张数据页、Q8 零交点、独立同侧光照、诊断高度全部不变。也不引入额外全图深度/海岸距离纹理。

海岸的分层依赖实际海陆裁切和高度趋近零的水域；陡岸/缓岸在已有真实海深梯度上呈现不同带宽。本批不额外宣称辨认珊瑚、沙洲、泥岸或河口，因为当前输入没有这些分类。严禁加入按屏幕距离固定宽度的发光轮廓、随机浅滩斑点、装饰等深线、波纹或不与地理一致的高光。

默认建议是更新共享 Atlas 材质，因此旧 Atlas 世界的海洋显示也会变化，地理/规则/存档不变；必须纳入旧地表回归。这是有意的显示影响，不应隐瞒。如果主线要求旧 Atlas 外观逐像素冻结，则本建议不能原样提升：需另加显式 v4 材质 profile，并在 backend、renderer 与共享缓存均带 profile 身份，单独评审这项新增范围；不要以兼容为由改写旧存档或重生成旧世界。

## 受影响检查与有意义的新增断言

所有检查留给下一批统一执行，本次没有运行。保留既有几何、预算与连续性断言，不能靠放宽阈值让材质过关。

- `src/world/terrain-material.test.ts`：保留陆地固定色与坡向、连续插值断言；明确更新有意改变的海色固定锚点。补平坦海域原始 light=1 精确回到色表、正反海床坡向响应对称且有界、深度 gain 过渡连续。近零端点仍是海域，绝不能被零高程陆色污染。
- `src/world/terrain-mesh.test.ts`：保留海陆独立不透明表、线性 UV、共享像素/创建销毁账；更新有意改变的海色固定 RGB。补整条平坦水深扫描不得出现反向突亮带、陆地表与旧表字节一致；海洋表各行的光照差受设计上界约束。不要用导入同一实现计算预期值作为唯一 oracle，应有独立锚点与界限。
- 原样联合 `detail-terrain-light.test.ts`、`detail-terrain-shader.test.ts`、`detail-terrain-pages.test.ts`、`detail-terrain-backend.test.ts`，检查 12 节点、单侧斜率、1-Q8 细片、跨格/owner/扇片连续、原物理高度仍成立。补 renderer/cache 定向断言，材质版本进入 key，不增加 data page / LUT / rendered tile 的上限。
- GPU 下轮应复用现有 `.autopilot/ph06/detail-shader-checks/harness.ts` 的实际诊断高度/海陆探针，并把连续光照 harness 的导入明确指向此次生产字节（旧 `.autopilot/ph06/v4-continuous-light-staging/gpu-harness.ts` 现在仍导入旧 staged shader，不能原样运行后当本次生产证明）。独立色彩预期覆盖深海、陆坡、-100、-1、零岸边、相反坡向；保留原高度容差 1/128 米、颜色 2 byte、接缝 1 byte，不凭空提高。前后诊断海陆/高度结果、CPU pick、source block/tile hashes 必须相同。
- 统一 lint / types / 所选单测 / build / dist 审查。三个材质模块不属于当前 generator/engine 实际闭包，预期全部生成器与 engine 身份不变；以实际构建的前后对比确认，不能手写或猜测。新的构建产物需绑定材质源码指纹；这不是一次生成器历史迁移。

## 实际视觉比较范围与副作用

- 在同一个保存快照、同一修订、同一相机/viewport/DPR、同一选中状态下比较旧材质和候选，禁止重新生成再比较。preview20 档案图可以定位问题；严格 A/B 应用实际归档存档，或在当前统一检查完成后创建一次固定候选快照并在改材质前后复用。不得宣称有未读取的历史存档。
- 至少保留：全图远景、能同时见浅海/陆坡/深海的中景、1135% 附近的近岸；同一海湾、突出岬角、12-world 窄海峡与小岛、低坡和陡坡各一处。近景必须让真实有限节点折线仍可观察，不加模糊掩盖。采样网格开/关各看一次，岸上岸下点选不变。
- 根现有 `tests/atlas-add-detail-coast.spec.ts` 的实际 UI 绘制、追加保护、取消/撤销、刷新恢复可复用同一次三端轮次；`tests/atlas-detail-coast.spec.ts` 负责近岸拾取与 GPU 恢复。记录桌面、手机仿真、平板仿真；真机与用户“自然海域”视觉仍是独立待验收。
- 预期改善是减弱整圈青蓝高亮、保留海深可读性。颜色过暗可能降低窄海峡和小岛的辨识；削弱坡光可能让远海变平；10 米 LUT / 33 光照级别在浅水端可能显阶梯，需真实 GPU 看图，不能仅凭色表认为改善。
- 色彩变换只能呈现当前数据。旧陆架高度剖面仍偏统一，真实海床内部地貌仍有限；材质不能替代下一批海床生成、侵蚀/水系或国家/城市/战争功能。没有新增风浪、潮汐、海流或地貌实体。
## preview21 桌面扇形暗纹补充：数据剖面与坡向光照不能混称

根补充了同一轮 preview21 桌面截图后，本代理只用 view_image 读取了 `.autopilot/ph06/regional-coast-browser/desktop/artifacts/atlas-add-detail-coast--de-20e0a-eload-and-overlap-rejection-desktop-chromium/` 下的 `saved-mountain-mid.png` 和 `restored-coast-close.png`。158% 中景的右上/右侧海湾外有明显朝外延伸的扇形、斜向深浅楔形；1135% 所选岸点相对平缓，但仍有宽亮青浅海带。没有启动新浏览器或 GPU；没有把 preview21 与旧20的不同轮廓当材质 A/B。

应分清三个层次：

1. **海色对比**：近零 `#79bac0` 到较深海色的强亮度差导致整圈青光。降低浅海亮度会直接减轻此项。
2. **海床坡向的显示放大**：当前 shader 用真实海床同侧高度求坡向，幅度 ±13%，而不是物理水面的反射高光。降低海洋 LUT 的 light 响应会减弱海床起伏明暗。这一改动不改变高度、距离与坡向本身，也不应将残留暗纹掩盖成“已修好”。当前共享节点连续光照减少的是格边亮度跳变，不能保证一个带折转的真实坡场变成自然海床。
3. **真实海床中的形态与坡度转折**：`detail-shape-distance.ts:162–194` 通过所有实际岸段距离的最小值取 `distanceQ`。在不同最近岸段的分界处，距离连续但梯度可以转折；凹湾和密集岬角可能形成朝外的分界线。该距离进入 `detail-natural-relief.ts:180–182` 的陆架高度剖面。此外 `detail-shape-natural.ts:317–320` 并非直接保存单一 nearHeight：它以 `smoothQ(abs(coverage)/32767)`，在约 128-world 范围内，把真实近岸高度 `nearHeight(originalBase)` 混合回 `sampleBaseElevation` 粗海床重建。这个粗/细高度混合也可能把粗场坡面形态带入可见海域。它们均是已写入的高度数据路径，不是 shader 装饰条纹。

仅由这两张截图与源码，**不能定量认定每条楔形分别由最近岸段分界、粗细混合还是坡光贡献多少**；以上第3项是有明确代码依据的待核原因，尚非已完成数值归因。下一批若要归因，使用同一固定存档/同相机做三份只读诊断：原正常材质、只把显示 light 置1的真实高度色表、保存高度的诊断读回与跨暗纹的物理高度/梯度剖面。light=1 只用于隔离原因，不能作为删除检查或正式“修复”来宣告通过；海陆/高度探针须原样相同。

若 light=1 时条纹/等深色结构仍在，或物理剖面出现同位置坡度转折，则记录“海床生成仍需独立修复”；本建议的三个材质模块不处理该数据问题。后续真实海床修复必须另立有身份历史保护的生成器批次，审查旧海床追加保护、窄海峡双岸、细场采样与存档身份，不能顺手平滑旧存档、挪动岸线、改 nearest-distance 的权威 coverage 或偷偷修改粗细混合公式。材质批次应分别报告“青色光带减弱程度”和“扇形/斜向海床暗纹是否仍存在”。