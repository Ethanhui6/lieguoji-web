# 原作点击模板的 V5 适配

2026-10-04。来源仍为 README.md 中登记的用户授权安装包高度模块及 Azgaar MIT 模板/算法，完整许可在 licenses/。没有执行原作 DLL、恢复 JS 或原游戏。独立 click-engine.ts 保留旧 engine.ts 的历史生成指纹；不要把两个入口互换。

## 已恢复调用合同

- `World.ClickToGenerateMap` RVA 0x6A6A70：centerCell → GetSite → site float X/Y → centerPoint；InitMapGenerationSettings(center,false)。
- `World.InitMapGenerationSettings` RVA 0x6BAB00：isClickToGen=true，isNoiseHeightGenerator=false，template=pangea。sizeFactor=min(0.3f,min(abs(x-width),x)/width,min(abs(y-height),y)/height)，按float32计算，边缘允许0，不读取画笔半径。构造时0.1f会被覆盖。
- main.mjs 7611–7612 将中心和尺度交给 JS；7656–7665 从零高度跑模板，再 max(old,new)。原高度不参与模板内部的 Trough、Multiply、Smooth、Mask。
- main.mjs 1827/1861：blobPower=(.93-.83)/.3*sizeFactor+.83；linePower=(.77-.75)/.3*sizeFactor+.75。
- 1891/1927/1963/2068：先把宽高乘 sizeFactor，再交 getPointInRange，整数 rand 在缩放后取整。不能先取整后缩放。
- 1975/2078：终点 offset 按全图采样后乘 sizeFactor；1982/2084：距离重试范围也乘 sizeFactor，最多50次。
- Mask 2233–2244 始终按全图坐标；Modify/Smooth遍历新高度场；highIsland的Add7不是局部圆形涂抹。

仅开放逐行核过的 pangea / highIsland，两者不用 Strait，不需要伪造加密后不存在的 cellsX/cellsY。pangea是原点击默认；highIsland是已恢复的另一个原模板，网页选择器为适配扩展，不称原点击UI已有此项。

## 明确的网页差异

- 现有d3拓扑、存储邻接顺序、nearest稳定首ID，尚不等同Unity原拓扑/KD tie。
- 固定种子Alea替代每次Unity重新选randomInt；JS传播随机调用顺序保留，未证明原运行随机流逐点相等。
- 原场max合并后才施加玩家锁；“保留已画海岸”默认开启，额外冻结全部海点/h20和跨海陆三角面顶点，保证当前插值h20轮廓固定。河流、阴影仍会重算。关闭时允许新增陆地和海岸扩展，无圆形裁剪、不承诺局部之外全不变。
- 16—50000点、128邻接上限、双向连通校验、0—100高度、256M工作预算和Worker终止超时是网页安全边界，不静默clamp。
- 图形、历史、IndexedDB保存全部使用真实输出高程；预览不写库，确认后单步commit。数据库schema、CAS、beforeProtection均不更改。

单元测试与浏览器是网页适配证据，不等于原进程联调或iPhone/视觉验收。
