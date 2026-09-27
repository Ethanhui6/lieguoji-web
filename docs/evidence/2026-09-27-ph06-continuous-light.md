# PH06 近岸连续光照修复：preview.11

记录日期：2026-09-27。对应PH06-T3/T4，状态均保持 `in_progress`。本批限定的显示光照检查通过；完整自然外观、用户视觉、真机、性能及PH验收没有通过，也没有发生云端写入。

preview.10的近岸每2world细格出现整片明暗边界，来自相邻真实三角片使用各自常量坡度光照。preview.11改为共享细节点分别计算海陆侧光照，量化岸线交点继承同侧端点值，再在原权威裁片内插值。它没有平滑或重画海岸，没有改用coverage双线性插值，也没有改变高度、拾取、存档和生成结果。技术边界见 [ADR0019](../adr/0019-shared-terrain-light.md)。

本次实际构建版本为 `0.5.0-preview.11`，基础HEAD为 `cc3dbf64e545328d2d4ed852e20128668fd2be4a`。归档时产品变更尚未提交，HEAD不单独代表本次完整源码；源码快照与实际dist分别绑定在 [verification.json](ph06-continuous-light-2026-09-27/verification.json)。`dist/build.json` 原字节SHA256为 `eaf3025970c2d241a285ecec9f3ab1c1427176410f276262a03e4db6a64222e7`。10个生成器的完整身份记录和 `engineFingerprint` 与变更前构建及已归档preview.10逐项一致。

| 实际检查范围 | 结果与边界 |
| --- | --- |
| 根相关单元 | 4文件34/34通过，执行4379.2897ms：detail-terrain-light、shader、pages、backend。不是world全量重跑。 |
| 根静态与构建 | 计划校验、全局lint、类型检查、生产构建和25项dist白名单审计全部exit0，源码稳定。 |
| 候选CPU首轮 | 6/6通过，只执行一次；这6项已包含在根34项中，不能合计成40个独立用例。 |
| 候选GPU first | 实际WebGL2编译、渲染、readback；316个海陆/高度/颜色探针通过。没有有效接缝探针，不作为连续性通过证据。 |
| 候选GPU gpu-continuity | 316个一致性探针及5条有限接缝探针通过；CPU复用首轮，没有再执行6项。 |
| 候选GPU gpu-finite | 最终316个一致性探针及5条有限接缝探针通过，显式拒绝非有限读回；CPU仍复用首轮。 |

三轮GPU候选源码均稳定并匹配提升后的产品shader。每轮一致性最大颜色误差0字节、高度误差0.001953125m；最终5条接缝的实际颜色差均为0字节，保留原1字节容差。它们是GPU探针数，不能写成948个单元测试，也不能替代实际产品或真机验收。初审未覆盖接缝的限制保留在 [首次审查](ph06-continuous-light-2026-09-27/provenance/continuous-light-review-first.md)，后续变更见 [增量复核](ph06-continuous-light-2026-09-27/provenance/continuous-light-review-final-delta.md)。各轮原始输出分别保留在归档的 `raw/candidate/first`、`gpu-continuity`、`gpu-finite`。

三端本构建执行的是 `tests/atlas-detail-coast.spec.ts`，runner模式为legacy，使用旧配方覆盖当前v4细海岸显示链路。不是本轮重新执行两大陆追加测试。绘制、预览取消、确认保存、近景海陆拾取、刷新恢复及GPU上下文恢复的断言通过；各端均0重试，source/dist前后稳定。

| 实际浏览器轮次 | runner耗时 | 结果 |
| --- | ---: | --- |
| desktop-first / desktop-chromium | 110166.6374ms | PASS，exit0 |
| mobile-first / mobile-chromium | 105531.1717ms | PASS，exit0；手机仿真 |
| tablet-first / tablet-chromium | 137727.9559ms | PASS，exit0；平板仿真 |

以上是功能执行耗时，不是帧率、响应时间或完整游戏性能验收。当前每fragment读取4个角点及8个轴向邻点，最多12次真实节点读取；沿用五个源页、16,797,696字节及两张LUT，源纹理像素、字节和原缓存预算没有增加。由4次读取增至12次仍有运算成本，不能由显存不增推导性能不变。

实际IAB对比使用同一已保存测试草稿修订1、同一1280×720视口和同一组原生滚轮操作，前后均为1120%近岸视图。root记录 `sameCameraConfirmed=true`；修复后控制台warning/error为空。可对照 [修复前截图](ph06-continuous-light-2026-09-27/observations/manual-before.png)、[修复后截图](ph06-continuous-light-2026-09-27/observations/manual-after.png)及 [原始观察](ph06-continuous-light-2026-09-27/observations/visual.json)：原明显方格状明暗边界已消除，同一岸线位置与形状保持一致，没有重生成地理。证据只包含测试截图与观察记录，没有导出真实存档。

此次观察明确为 `displayLightingAccepted=true`，同时保留 `naturalVisualAccepted=false`、`visualAccepted=false`。整体地形仍显稀疏，内陆采样、自然山形、大陆轮廓与更多种子需要继续验证；水系和植被尚未完成。真实新Atlas中仍没有国家、行政区、城市、军队和战争。局部重塑、用户视觉、真机及性能要求也不由本次光照修复满足。

完整原始归档为 [ph06-continuous-light-2026-09-27](ph06-continuous-light-2026-09-27/README.md)，记录于2026-09-27T11:46:09.677Z，共95文件（含inventory；[inventory](ph06-continuous-light-2026-09-27/inventory.json)记录94项并排除自身），pending为0。`archiveComplete`、`allRequiredPassed`、`allDisplayLightingAccepted`均为true；`naturalVisualAccepted`、`visualAccepted`、`allAccepted`、`phaseAccepted`、`physicalDeviceAccepted`、`performanceAccepted`和 `cloudWrites`均为false。保存原始日志、源前后快照、GPU读回、浏览器trace、截图及提升记录，不拷贝构建产物或认证数据。

preview.10根32项、foundation34项、其三端追加/入口/旧配方流程，以及preview.9未受影响的908项，只通过 [references.json](ph06-continuous-light-2026-09-27/references.json)哈希引用复用。旧结果没有重标为preview.11新执行，也没有与本批34项、候选6项或GPU探针相加。此次仅补充PH06-T3/T4证据，沿原计划继续；没有修改阶段状态或解除发布限制。
