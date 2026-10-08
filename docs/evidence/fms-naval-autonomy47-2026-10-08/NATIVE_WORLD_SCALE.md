# 原作世界坐标比例的进一步静态证据

2026-10-08，只读指定安装目录的GameAssembly.dll；原作、恢复脚本未执行，未读取场景个人存档、认证或SDK配置。只读核查由本线程子代理提供，根记录证据。本文件不声称已测出最终比例。

DLL SHA-256：`d42658a922155f6cc60295a64c02207e5eaa1d3a55fd5ed18dc8ecc562f9b82b`。

| 函数 | RVA区间（右端不含） | 文件偏移 | 字节数 | 函数体SHA-256 |
|---|---|---|---:|---|
| World.UpdateBounds | 0x6C6F00–0x6C70B1 | 0x6C5500 | 433 | 677775bc613613e14ec6c31b00343cf200883b33058b23e4080019619c635739 |
| World.VoronoiTransformPoint | 0x6CACA0–0x6CAD01 | 0x6C92A0 | 97 | 9fff400cff67c6e95ab32701f8e1b411214da2ce3b2efe9892453fc505a96bb6 |

UpdateBounds边界来自PE异常展开表，包含末尾空引用异常路径。VoronoiTransformPoint是无展开表项叶函数，0x6CAD00为ret，之后int3填充；到下一索引方法0x6CAD10的112字节（含填充）SHA：`ec76b363f00af84146a0e4c28ad09169067b0211a9798fa909c5c38445998243`。

## Bounds来源

0x6C6F48调用Component.GetComponent，元数据引用0x2E93908为`Method$UnityEngine.Component.GetComponent<Renderer>()`。随后Renderer.get_bounds(0x23072E0)、Bounds.get_size(0x22EED20)产生世界尺寸。

- 0x6C6F8F/0x6C6F91：size.x → BoundWidth(+0x128)。
- 0x6C6FC7/0x6C6FCA：size.y → BoundHeight(+0x12C)。
- 0x6C7004/0x6C7008/0x6C7010：f32(size.x×0.5) → BoundOffsetX(+0x130)。
- 0x6C7061/0x6C7066/0x6C707A：f32(size.y×0.5) → BoundOffsetY(+0x134)。
- 0x6C703E…0x6C709B：私有bounds(+0x118)是Rectf(0,0,f32(Width),f32(Height))，不能与Renderer世界Bounds混为一谈。

四次各自读取Renderer.bounds.size；本函数没有读取Bounds.center。0.5常量RVA0x256CC00、float32位型0x3F000000。直接辅助函数Bounds.get_size把extents各分量addss翻倍；Rectf构造0x795090把四float直接写字段。

## 正向变换

每步f表示float32舍入：

```
worldX = f(f(f(point.x / f(int32 Width)) * BoundWidth) - BoundOffsetX)
worldY = f(f(f(point.y / f(int32 Height)) * BoundHeight) - BoundOffsetY)
worldZ = defaultZ
```

X关键地址：0x6CACA8转Width；0x6CACBE除；0x6CACC5乘；0x6CACD5减；0x6CACDD写。
Y关键地址：0x6CACCD转Height；0x6CACE7除；0x6CACEB乘；0x6CACF3减；0x6CACFB写。
Z在0x6CACA3原样写defaultZ。没有额外速度倍率、1000归一化或Y翻转。

这与已恢复InverseVoronoiTransformPoint公式闭合，见`docs/evidence/fms-native-hill-v5-2026-10-04/ORIGINAL_PORT.md`。

网页以1000/max(Width,Height)归一化时：

```
kx = 1000 * Width  / (max(Width,Height) * Renderer.bounds.size.x)
ky = 1000 * Height / (max(Width,Height) * Renderer.bounds.size.y)
```

不能把倍率设成1、10或100来凑登陆日期；旧46的900日迂回问题也不能由新47静态风险反推根因。

## 初始化追加核查：WorldPos生成已闭合

进一步只读三个主入口和三个必要直接入口；仍未执行原作/恢复脚本，未扫描场景或其他资源。

| 函数 | RVA区间 | raw偏移 | 字节数 | SHA-256 |
|---|---|---|---:|---|
| InitBaseWorld | 6B8300–6B8F4E | 6B6900 | 3150 | 6ec2ab0c9cad2e27e449918e2714fd35696b56d7d88fcdde5d0e2ae2574ab798 |
| InitMapFrame | 6B9FB0–6BAAF9 | 6B85B0 | 2889 | 92fa31d5abca7cf062e389c97c072ec1a245c0e83aa345b85152a2b5bf923e0e |
| InitMapFrame3 | 6B9AA0–6B9FAD | 6B80A0 | 1293 | bb2ae359c0ad3bd9c301f4ea6dcf22a76f528c922a788e43f0dee794643ef453 |
| GenerateSections | 6B31F0–6B48DE | 6B17F0 | 5870 | 5bf90ca54b8cbb2d25ce22afc38a5e458ea0c6950c3f80499899297ead96110f |
| InitDrawMesh | 6B8F50–6B9A9D | 6B7550 | 2893 | 7445e4260f0be6ccc407ed909342d5e6f47d83c2ae7e0407b5523b3130230d16 |
| InitMapFrame共享selector | 6C66D0–6C6733 | 6C4CD0 | 99 | 44af1699e9cfffabfd4cdab200d4019acef073ef3ca857a3cb55af857dcf6318 |

前五项边界来自PE展开表；selector叶函数在6C6732 ret，6733起填充。

InitBaseWorld：6B86D9 GenerateSections →6B8751 CheckCellNeighbor →6B8768取Sites →遍历。6B87EC读CellData.WorldPos(+F0)，6B87F3–6B8835逐步内联同式`site/dimension*bound-offset`，6B8852令Z为float32(-0.2)，6B8866取Site.index，6B886A调用List<Vector3>.set_Item。不是函数call，不能因未call VoronoiTransformPoint而否认同一坐标关系。其后6B886F才检查isUseCellDataPoints；false时6B888D–6B88BC还写原始SiteXY到Pos(+F8)，两条分支都已重建WorldPos。

GenerateSections 6B42B1–6B42DC取`xScale=f32(BoundWidth/f32(Width))`和yScale，再于6B4339调用并行mesh builder、失败于6B4383调用顺序builder。这是消费既有比例，不是Renderer尺寸来源。网格预计算比例顺序与WorldPos逐点先除再乘的float32顺序不同，不擅自替换。

InitDrawMesh 6B97A6实例化World+2F0对象，6B97BC取新Transform，6B97E6只写position(0,0,1e-6f)，不是World Renderer的scale。

InitMapFrame 6BA279–6BA331用逻辑角点(0,0)/(1600,0)/(1600,900)/(0,900)，随后selector按既有World Bounds变换。1600×900不是已证的Renderer世界尺寸或当前World.Width/Height。共享selector的Z约-0.7f。InitMapFrame3读取Width/Height，6B9B9A–6B9BCB按f32(f32(Height/30f)*1.41f)扩边，再生成Quad；这里30不是速度比例。

上述主体未见写World尺寸字段+128…+13C或set_localScale；不代表未展开下游都已排除。剩余核心缺口收窄为：**Renderer网格/Transform的实际bounds.size输入来源，以及尺寸初始化/UpdateBounds的调用先后**。不能据此声称已得到数值倍率或完成900日存活验收。
