# 自然海岸仍过于整齐：下一批窄审查

2026-09-28 香港。只读当前算法、既有数值输出和已记录参考观察；没有运行生成器、测试、构建或浏览器，没有改生产或候选算法。唯一新增此报告。

## 直接结论

这次外观问题已经存在于实际地理数据，不是显示纹理或采样格藏起来就能解决。实际查看 `v4-natural-visual-repair-staging/checks/continuous-type-guard-fix/actual-256-height-field.png`：大陆仍像四角圆顺的菱形，边沿只有浅凹凸；没有明显大小不一的深湾、狭长岬与稳定平缓海岸段的对照。它是已有真实高度/覆盖的 4-world 数值切片，不是产品渲染截图，更不是新的视觉验收。

最小下一步是**把两层等间隔正负波改为一次预建的、不等宽、不等距、左右不对称的湾岬弧长结构 profile**，继续走现有 signed field → 2-world细片 → target岸线 → 真实距离coverage管线。不要再堆一个全图noise、扩大分辨率或新建第二套画线权威。

## 输出与输入证据

读取已有 JSON 的 recipe、targetCoast 和面积，独立计算距离/凸包（只读数组统计，没有重跑生成器）：

| 项目 | 实际值 |
| --- | --- |
| 原8点，world坐标 | (650,1300), (950,1120), (1200,1260), (1440,1590), (1310,1850), (1010,1980), (760,1790), (580,1580) |
| 输入几何 | 完全凸，包围盒860×860 world |
| 原轮廓周长 | 2541.286793 world |
| 原面积 | 469350 world² |
| 实际recipe | structure96、roughness16、islandChainCount0 |
| summary | 圆顺8个角，派生104条outline边，总改形包络112world，target3012段 |
| 目标岸线相对原多边形向外最远 | 63.885843 world |
| 向内最远 | 77.099333 world |
| signed offset的5% / 中位 / 95% | -56.860393 / +6.741883 / +63.364038 world；正值在原图内 |
| 输出陆地面积 | 453046.631142 world² |
| 输出岸线凸包面积 | 491405.835953 world² |
| 陆地/凸包 | 0.921940 |

距离是 target segment端点到原8条线段的欧氏距离，内外用原多边形ray parity；凸包对 target端点去重后构建。此fixture没有岛屿，面积比可反映其整体仍很凸。这个比值不是“越小越自然”的万能验收，不能追求数值故意锯齿化。

PNG未画白色输入线；同目录 SVG 把白色虚线原轮廓叠在同一数值切片上。不要说 PNG 已提供原图对照。

## 为什么变成几瓣圆顺轮廓

1. **原输入本身没有湾与颈。** 这8点全凸，系统需要在允许包络里新增结构，不能把它视为已经有丰富大地形的轮廓。
2. `detail-natural-outline.ts:212–225` 的 `naturalArcField` 取偶数 knot、严格等弧距、强制正负交替。seed只改变phase及每个knot幅度；没有不同湾口宽度、肩部偏斜、安静海岸段或成组区域差异。
3. `detail-shape-natural.ts:186` 用固定 `2*768层 + 3*320层` 再除5。原周长约2541，圆顺后两层仍是4和8个knot，形成整倍频的重复分瓣。两层正负也可能抵消，最强湾岬被削弱成柔和凹凸。不能只增加此混合的强度而继续保留周期结构。
4. `roundAndIndexNaturalOutline:113` 每角cut最多48world，再作二次圆顺。本例8个角都被圆顺，进一步消除原多边形尖角。这一步有必要修复手绘折线，但叠上等间隔波容易得到相似圆头。此次先保留它与预算扣除；不要同时换角处理、profile和coverage三套规则而失去归因。
5. 结构外只有48/12world波长的两层小noise，roughness16。它提供细岸锯齿，不能独立产生有明确湾口/湾腹的几十到几百world层级关系。本fixture岛链明确关闭，也不会自动产生近海岛屿。
6. 现有 `detail-natural-visual-repair.test.ts:70–75` 只要求两侧最大偏移超过24、总包络不越114并守面积。当前输出确实满足，但这些条件没要求湾岬的间距、宽度或形状不同，因此不能证明用户要的大陆外观。

## 建议的精确实现范围

只需要一个结构helper及现有kernel的两处接线，不改渲染器、存档schema、采样精度、海岸权威或局部山地：

- 在 `detail-natural-outline.ts`（或单独小helper）提供 `createNaturalCoastProfile(seed, perimeterQ, structureWorld, ...)`。准备一次并持有私有计划；返回 `sample(arcQ)`。输入/输出仍是有界 fixed-point结构幅度。
- `detail-shape-natural.ts` 在 `outline` 准备完、`design` 闭包建立之前准备profile；将186行两次 `naturalArcField` 混合替换为该profile采样。保留188行既有小粗糙层和189行预算组合。仅改outline函数而不做这两处接线，会迫使每个fine节点重复建计划或引入隐式全局seed缓存，均不建议。
- 旧 `naturalArcField` 可保留供历史窄检查；不能让未使用的旧函数测试冒充新profile接缝证据。root负责真实生成闭包及原身份冻结。

profile推荐是**少量主湾岬及较小附属湾岬的有界事件序列**：

1. 基于真实整岸周长，确定有硬上限的event数量；例如最多48个结构event，不随fine节点数增长。短轮廓必须缩短/减少可用事件，不把最小大大陆波长塞进小岛。
2. seed决定不等弧长区间、内部偏置中心、不同的左右肩宽、不同peak深度以及部分留白区。布局用不等长prefix intervals或受最小间隔约束的明确有限尝试，不做无限随机重试。
3. bay与cape符号不能机械逐个交替；允许一段强湾与邻近小岬、一段平缓岸线或同类feature成组。对可容纳的标准fixture保留真实正负结构，不能让随机同号导致只缩小原图。
4. 主feature应保留大部分请求的structure幅度（例如0.65–1倍），附属feature使用更小幅度与宽度；避免把两层等权相加后大部分相消。可以用不重叠的C1 compact events或明确限制同时重叠数的分层组合。最终值严格在±FIELD_Q；上界不是靠事后削平的大面积plateau获得。
5. 宽度/深度/左右肩形状独立变化，产生不等宽湾口、较窄伸出的岬以及缓湾腹。取零处与峰接点连续且一阶导数连续，环首尾wrap同一坐标。不要把一个对称cos/smooth波复制成“事件”。
6. 查询用有界interval lookup或固定弧长bins；给每个query最大候选数、总计划大小、总准备工作和取消点。不要在每个细节点上遍历全部候选，更不要用全图二维噪声查找特征。

这是算法设计建议，具体数值须由真实候选验证。保留当前96+16=112world总包络意味着本860world大陆最多约13%宽度的改形，不能在此合同内凭空造500world长半岛或深入半个大陆的内海。现有structure上限160已经提供更强的合法档位；首批应先看96同参数对照，不能为追求视觉偷偷改最大包络/世界margin/通道保护。

## 必须完整保留的保护链

- 原3–2048点、重复点/折回/非相邻自交检查，在任何简化之前执行。`simplifyNaturalSampling` 只去1/128world采样抖动；保留手画的真实湾端和陆颈。
- `naturalFacingSeparation` 检查相向非相邻岸，包括平行相对边；`distance/4-2Q` cap、端点向边的传播及圆角实际消耗预算不变。不要为了“更深的湾”放宽这些cap。
- profile只能替换189行中的结构值，不直接移动持久顶点。插值后的 `outline.caps` 仍限制每个位置实际总偏移，roughness也在同一总预算中。structure=0时该层严格为0；structure与roughness都为0时保持原literal轮廓语义。
- 继续生成真实2world细场、从同一三角片提取target、建立真距离coverage、coarse classify及保存同一地表。不要用SVG描边或装饰海岸线掩盖实际coverage。
- 16384派生轮廓点、8000000 outline validation工作、131072 target段、4096 ownertiles和现有距离查询预算全部保留；超限拒绝并保留原图，不能降采样/截断当作成功。
- 片内提取避免任意offset vector polyline的新自交，但现有source自交检查不等于新feature任意强度都不会在最终细场发生零点接触、分离或闭口。需实际用目标segments/最终coverage检查所需主岸闭合、不新增不允许的接触，并验证原12world海峡与12world陆颈全路径；若新增零点多岔或非预期组件，拒绝候选或减小该feature，不放宽安全界。
- 追加大陆走同一natural kernel，但最终disjoint splice、旧地理/旧高程锁逐片末审不变。更强湾岬不能拿新分量生成成功替代追加后保护验收。

## 这一批真正应检查的证据

保留已有保存、取消、源捕获、12world通道/陆颈、密采样等价、target距离与面积断言。再用原8点、原seed、原96/16输出实际overlay与海岸纯轮廓，并从actual target或coverage独立提取feature宽深/间隔，证明强湾岬不再等距等宽。仅 `max offset>24` 或辅助profile metadata中的“湾=3”不是证据。

至少还看一个非对称手绘轮廓和一个tiny/狭窄fixture；不需要无限seed sweep。原8点只有轻微改色或多一圈短齿则仍未解决。需要能在全图看出大小不同的凹入海湾和伸出半岛，在放大后看出小湾、岬肩及原手绘通道都保持真实地理关系。最终自然视觉仍交用户核验，不能由凸包比、测试绿灯自动代签。

## 参考与身份

`docs/REFERENCE_GAME_RESEARCH.md` 已记录先前实际查看官方截图1/4，及官方预告约0:02、0:34、0:49的观察：密集不规则湾岬/岛屿，地理与行政呈现分离。此次仅复用该书面研究，没有新播放视频，没有直接运行参考游戏，也不推测其私有生成算法。采用流程/形态关系，不复制美术或代码。

| 读取文件 | SHA-256 |
| --- | --- |
| actual-256-height-field.png | bd575d53011d368253ab11480d2dba3d6cfc4381c26f070b7e40a5f33399eb48 |
| actual-256-height-field.json | 5c266e397d19a295092d0a309bb991024b5fd335be97c01e738617536b453b0c |
| src/world/generation/detail-natural-outline.ts | 0428a0463f0775c20aca00d0224edc2c1f534256de137ae2f0dd8d097a8611db |
| src/world/generation/detail-shape-natural.ts | 7b07ebfd01ba47027eafa2f6cb20eec73a9c4e23351ab53a85c63c8459da8bf8 |

已把窄spec交给当前海岸候选作者；报告不授权在冻结浏览器流程结束前提升任何候选。
