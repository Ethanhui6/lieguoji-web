# 方案C：State.Update 边境消费者与 CellData 投影

## 接入了什么

FilterProvinceCells（已恢复，不再查找写入者）的 `borderNeighborCells` 进入生产 Worker。进攻目标的邻接改为几何格子接触次数大于 0，重复接触保留。突出部仍走 IsProtruding，输入是这张格子列表，不是邻省个数，也不是裁剪后的行军三角面。

CountBorderContactCells（RVA 0x689CC0）按格子上的国家编号计数，越界跳过，不去重。国家变化会改变突出部和国家接触次数；邻省集合、isSeaNeighbor、Feature、格子接触次数不变。

## 网页适配

- 省份归属：当前存档没有 CellData.Province。`originalCellProvinces` 的多边形三角投票只决定格子属于哪一省。投票不是边境数量。
- Feature：原作编号不在存档里。未提供时按海拔 >=20 与 <20 的格子邻接做洪水填充，编号从 1 起。这不是 Unity Feature 编号，也不是行军三角面的连通分量。调用方若传入 Feature，只复制，不改原数组。
- isSeaNeighbor 不是“贴着海洋”。省 0 在高度判断之前就被排除；只有另一省的格子海拔 <20 才为真。驻防临海、贴海进攻仍用行军面是否连到海。首都圈仍用多边形邻省。这两处在军令代码里标明网页适配。

## 引擎

规则已变，所以先冻结改动前的引擎，再改源码。

| 角色 | 指纹 | 字节 |
| --- | --- | --- |
| 本批之前的当前引擎，已冻结为 `compat/culture47/engine-4ba5.js` | `4ba56e393c0fea00fc5aed46d41391a6db626e65f358fce82fe6702341c10fb6` | 1423790，sha256 `b34a3f494b74fa2aee9c442a79efd8103d0ec85f3fb385eaf31e95a1c6799773` |
| 本批之后的源码指纹 | `d1ea3eb84b41ef4e06090c58c5a9c18602e75cc535f027f38a93ff897482a064` | 构建出的 `culture47.worker-Bncs_uvz.js` 为 1426068，sha256 `9c3de81b5b52bdd295f5b8e00ab8679ff9fc91c260f23861de78d630d6fee941`（dist 不入库） |
| 已验试玩 5365 / f6a84e7，未改 | `10b0c5adab450993a3c614c2200a20be164ac87044bf5b352ae40201002a4af5` | `engine-10b0.js` 仍为 1419905，sha256 `bfcbf0cbfa4e76690d08fcbf58f22441b66e808ca837fb1eb582bd533ca9c3d9` |

旧日志若盖着 4ba56e39，仍加载冻结字节。10b0 与 5365 产物没有重写。

## 检查

相关单测 53/53：

```
npx vitest run src/fms/play/native-combat/border-contact55.test.ts src/fms/play/native-combat/province-cells53.test.ts src/fms/play/native-combat/province-cells53-grid.test.ts src/fms/play/native-combat/province-border52.test.ts src/fms/play/province-border54.test.ts src/fms/play/celldata-projection55.test.ts src/fms/play/civilization47-army-ai.test.ts src/fms/play/culture47-verification.test.ts
```

- 省份格生产者 6，原作 19928 格合成省份 1，突出部内核 5，生产突出部读取 3
- 军令 27（含跨海进攻与驻防）
- 冻结引擎字节 5
- 新增投影 4、CountBorderContactCells 2

上一检查点写的 39 项，是当时的小样例/选敌回归加 1 项原作格点。上面的生产者、原作格点和突出部文件都在这 53 项里重新通过。投影测试另证：提供的 Feature 不被改写；直接调用 FilterProvinceCells 的邻省、isSeaNeighbor、Feature 一致性与生产视图相同；只改国家时这三项和格子接触次数不变，突出部或国家接触次数会变；至少一省的格子接触次数不等于行军面陆路链接数；`[2,2,3]` 对攻击方计数为 2，去重后只有 1。

`npx eslint` 覆盖本批改动文件，无报告。`npx tsc --noEmit` 通过。`npm run build` 通过（既有大包警告仍在）。

浏览器：桌面 Chromium，`GAME_BASE_URL=http://127.0.0.1:4173`，`npx playwright test tests/fms-culture47-border-cells.spec.ts --project=desktop-chromium`，1 通过（2.7s）。文化世界地图 `data-border-cells` 为 `source=cells`，24 省，724 次格子接触。样例省 p-0：12 次接触，邻省 p-1 与 p-6，sea=false，feature=2，connected=true。推进一天从第 0 日到第 1 日，页面错误 0。截图 [border-cells.png](border-cells.png)，记录 [browser-log.json](browser-log.json)。

## 还没做

不是 10 省/1 国的版本化轮转，没有把日财政改成每帧。不声称变快、画面与原作一致，或真机通过。无上传。
