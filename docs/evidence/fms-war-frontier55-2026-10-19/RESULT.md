# WEB-04-37 切片：战争目标、连片推进与和约账

2026-10-19。起点 `5944c0d`。完整原作战争 V2 仍未逐函数完成，本任务保持 in_progress。没有上传，没有改写 `.autopilot` 试玩产物或玩家存档。

## 行为

AI 选定进攻或回援目标时，军令原因写明战争目标（割让、控制、吞并或赔款）或“没有逐省战争目标记录”，并写明这一步是回援、友方土地、相连边境或可登陆海岸。

候选省份只来自当前实控或可借道土地的相邻敌省，以及已被敌军进入的本国或友方省。存在这类陆地前线时，远处海岸不会入选。行军仍走现有逐格相邻寻路；若记录路径有不相邻的一步，军令直接拒绝。

玩家停战（原因 11）不割地、不赔款。和约大事记写明转地名单，没有转地时写“无和约转地”；每个参战国写首都名称和该地现控制者。若首都所在省已经易手且本国仍有领土，沿用既有迁都，并把迁都事件编号写进同一条和约原因。和约本身的 `sourceEventId` 等于宣布前的 `nextEventId`，史书详情里显示“事件 N”。

外交预览不写世界。取消只丢掉预览。局势变化后确认按钮消失；拿旧预览戳执行会被 Worker 拒绝，原文包含“过期”或“重新预览”，世界保持推进后的快照。重新预览后才能确认。

## 边境接入点

`issueArmySelection47` 把 `webProvinceNeighbors55(r.world.provinces)` 作为 `ContiguousBorder55` 传给 `contiguousWarTargets55`。这个接口只提供 `adjacent(provinceId)`。并行的 CellData 边境格投影合并后，在这一处把 `border` 换成由 `borderNeighborCells` 外侧属主归纳出的邻省即可。`war-frontier55.ts` 不引用 `province-border54.ts` 或 `province-cells53.ts`。突出部评分仍单独使用现有 `provinceBorderReader54`。

## 网页适配

- 海路入口：原作 `GetSeaApproachDistances` 未恢复。只有陆地前线为空时，才把敌方海岸省当作入口，并在原因里标明网页适配。
- 陆地邻接：当前用网页 `province.neighbors`，不是原作 CellData 边境格。
- 迁都选址：`relocateLostCapitals47` 仍按最大连片、本土城市、人口、距离和城市编号择址，不是原作首都危机评分。

## 引擎

| 身份 | 指纹 | 字节 |
| --- | --- | --- |
| 5944c0d 源码指纹（未单独冻结） | `4ba56e393c0fea00fc5aed46d41391a6db626e65f358fce82fe6702341c10fb6` | — |
| 旧冻结 10b0，本批未改 | `10b0c5adab450993a3c614c2200a20be164ac87044bf5b352ae40201002a4af5` | 1419905，sha256 `bfcbf0cbfa4e76690d08fcbf58f22441b66e808ca837fb1eb582bd533ca9c3d9` |
| 本批行为构建，已冻结为 `engine-3945.js` | `39456634140137a045d9c92edcdf8cc143a2cd25153809b4a54dc229dd73bc3d` | 1427436，sha256 `4472ade6469d5435ce631d98263ecc8dd4bf6e3a67d29fa1e4d6d8d6b8067cb1` |
| 登记进源码之后的实时指纹 | `9fddc91f8f250117b9b543428cdc6576947a9d4fcde9cc22006edcc700da4eab` | 登记表和客户端引用进入指纹，与规则构建分离 |

旧日志里的 10b0 继续加载 `compat/culture47/engine-10b0.js`。本批构建打出的 3945 日志加载新冻结文件。登记之后新建的开发局使用实时指纹 `9fddc91f…` 和当前源码 Worker。5365 试玩产物未重写。

## 验证

Node 24.18.1。全仓 `vitest run`：468 文件、5948 项通过，其中新增 `war-frontier55.test.ts` 6 项。冻结字节核对 5 项通过。`eslint src tests scripts` 与 `tsc --noEmit` 通过。生产构建 124 个允许产物通过。桌面 Chromium Playwright `tests/fms-war-frontier55.spec.ts` 1/1，约 4.2 秒：取消宣战预览、推进一天后旧确认消失、重新预览并宣战、停战后大事记含战争结束、首都和事件编号。截图见 `peace-chronicle.png`。没有真机或原作视觉验收。
