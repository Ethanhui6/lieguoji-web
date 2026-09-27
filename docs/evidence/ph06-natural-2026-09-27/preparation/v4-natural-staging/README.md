# 自然大陆 v2 内核（暂存，尚未运行检查）

本目录仅包含新内核、两个纯地理 helper 和定向测试。没有注册生产配方、接UI、改已有存档或改当前dist。旧 `src/world/generation/detail-shape.ts` 的原始SHA保存在 `baseline.json`；所有复制/接线脚本仅写本目录，不应重复运行覆盖当前暂存。

## 接口

目标 `src/world/generation/detail-shape-natural.ts`：

```ts
generateDetailShapeNatural(
  input: { base: EmptyDetailShapeBase; recipe: NaturalDetailShapeRecipe },
  control?: DetailShapeControl,
): Promise<NaturalDetailShapeOutput>
```

`base`、`control` 与原首片内核结构兼容：已核验的新空v4快照；真实粗重心/高程精确ArrayBuffer；空detailCoast；锁/实体/生成历史必须由上层核验后确认为空。内核仍严格拒绝非空输入，不能用几个来自UI的布尔值替代文档核验。私有复制在第一次yield前完成。

`recipe` 是**内核输入**，具有独立 `format: 'lieguoji-natural-shape-recipe', version: 2`，增加 `coastStructureWorld: 0..160`；其余字段为原seed、pointsQ、coastRoughnessWorld、reliefMeters、shelfWidthWorld、islandChainCount、islandsPerChain。建议UI新的主要湾岬默认96，小海岸细节仍32。输入点离世界边界须有 `(coastStructureWorld + coastRoughnessWorld + 52)` world边带，根adapter/用户提示必须相应绑定，不能沿用@1较小的margin。

后续Atlas配方的外层容器仍为 `format:'lieguoji-atlas-recipe', version:1`；注册的是生成器语义 `shape-detail-landmass@2` 和 `add-detail-landmass@2`，不要把外层容器误改成2。内核seed域为 `shape-detail-landmass@2`。版本1读写/已存身份不能重标为2。

输出仍为完整 `detailCoast` map、匹配的 `coarseElevations`、可重建 `sampleBaseElevation`、诊断 `targetCoast`、真实面积与工作摘要。新摘要 `natural` 包含圆顺角点数量、派生边数、最大轮廓变化包络、真实山脉支撑段数量与局部坡度/陆架合同。原 `originalEdgeTests` 改为准确的 `outlineEdgeTests`，因为新查询对象是派生自然轮廓；上层不得误读计数名。

## 实际生成实现

1. 私有原轮廓仍先验证自交/折回和面积。保留到非相邻边距离的限幅。局部二次曲线替换大转角，切角最多48 world且受相邻长度和保护间隔约束；实际离原轮廓的位移从剩余变化预算扣除。派生点最多16384，AABB索引重新核验非相邻接触，累计800万实际验证单元时明确拒绝，不退化精度。
2. 主要湾岬沿**整条闭合海岸弧长**的768/320 world周期场生成，有独立结构参数；48/12 world小纹理仍单独受限。周期闭合接缝连续，不以每条输入线段为周期。设计场用于选定形状，随后仍提取固定Q8细三角短岸段、重建截断真实目标距离、写真实LGDC、最终按保存场裁切验面积。目标段上限131072，没有用设计噪声伪装距离。
3. 高程不再使用全大陆20%起伏基座。基底低地约为起伏上限的1.5%—7.5%，少量滚动起伏约2%。大陆内采用一个长山脊与两个有限侧支撑组，最多19锚点、16短支撑段；宽度至少4个粗步长，避免把不能由实际样本表达的细脉伪装成真实地形。实际覆盖探针拒绝观察到的穿海支撑；这不是完整地质、水文或寻路证明，山脊从不改海陆覆盖。
4. 陆侧起坡宽度沿区域变化为6—36 world；海侧陆架为16—112 world范围内的区域场，两者独立。到32767Q8截断距离时海底已回原海床；细节点也精确衔接持久粗样本的现有Hbase。所有这些都是写进真实高度的数据，不是显示纹理、模糊、假河或调色。

## 成本与未接线事项

没有新增全世界细高程数组。新增粗分类/距离数组为每粗单元3 bytes；helper另私有复制粗重心、分类和距离，总量有固定 `size²` 界。锚点搜索最多19次比较/合格粗单元，ridge高度每采样最多16段，真实工作按64—2048单位分批yield；不提高现有Worker批预算。海岸结构幅度会扩大活跃owner带，真实tile/段/查询统计仍输出，尚未宣称性能通过。

追加必须由上层把**新分离组件**交给同一个v2自然内核，然后沿用现有相离拼接和真实锁守卫。此内核不直接接受已有世界，也没有提供覆盖旧地形或跳过锁的接口。后续仍需两版本配方验证/历史读取、实际指纹、首片与追加adapter/session、UI、Worker/存储和原生浏览器接线。

## 写好的10项定向测试（均未运行）

- 实际结构位移超过小粗糙度；真实低地与定向高地高度跨度。
- 保存的是重算目标距离；饱和细节点接回持久Hbase。
- codec恢复后最终面积、岸点拾取与粗重心海陆一致。
- 保留12 world窄海湾。
- 保留12 world陆地连接颈。
- 不同工作分批与调用方修改输入后结果一致。
- 新轮廓与地貌的实际工作阶段可取消，源不变。
- 明确拒绝旧身份、边界不足、自交、已有世界。
- 圆角包络、零结构的原轮廓行为、弧长场闭合接缝。
- 实际陆架深度变化、与陆侧坡度分离、helper不受源/诊断副本修改影响。

全部检查待根代理协调后执行：没有lint/type/unit运行结果，没有新自然截图，也没有产品/视觉/真机通过结论。产品当前浏览器继续使用冻结版本，本目录尚不可当作试玩交付。
