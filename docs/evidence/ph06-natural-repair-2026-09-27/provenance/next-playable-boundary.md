# 玩家手绘大陆建国设都：当前接口与最小可交付边界

2026-09-27，只读源码与主计划审计。只新增本报告；未修改源码、任务状态、发布策略或受测产物，未运行检查/浏览器/性能测试。preview10 正在检查，本报告不把其提升当作验收通过，也不重复地形性能诊断。

**结论：技术上的最小真闭环可以拆成 3 项，但它们不是当前已经获阶段准入的“下一批”。PH06 未完成，PH07—PH10 全部 todo；城市与首都还明确属于 PH14。遵守现有依赖时，应先关闭 PH06 实际剩余门，再沿主计划推进，不能把旧工坊按钮挂到 format4 后声称新大陆已建国。**

## 1. 当前主计划，不能省略的依赖

| 阶段 | 当前状态 | 依赖 | 与目标直接相关的边界 |
|---|---|---|---|
| PH06 | in_progress | PH04、PH05 | T1/T2 done；T3 细海岸/几何拓扑、T4 局部生成/锁/进度取消仍 in_progress |
| PH07 | todo，4 子项全 todo | PH06 | 流域河湖、气候、资源生态、局部重算；不能用地形颜色替代 |
| PH08 | todo，4 子项全 todo | PH05、PH07 | 实际编辑工具、笔划事务/撤重做、三端操作与保存恢复 |
| PH09 | todo，4 子项全 todo | PH08 | 真图层、持久实体标签、定位导航；后继实体尚未出现时不能造城市或国界 |
| PH10 | todo，4 子项全 todo | PH09 | 国家/政权/统治者引用分离；手动与自动建国、领土实控/法理、制度 |

出处：`plan/tasks.json:723–1000`。另核对到 PH11 依 PH10+PH04、PH12 依 PH11+PH07、PH13 依 PH12+PH08、**PH14 依 PH13+PH07**；PH14-T1 手动/自动聚落，PH14-T2 首都/治所分别指定（`:1128–1153`）。因此“首都落点”不是 PH10 单独完成就已满足全部计划依赖。

现在允许的有界下一批是收尾 PH06-T3/T4；若两项及阶段门真实通过，下一批首项才是 PH07-T1。不能在本报告里改依赖、偷开 PH10/PH14 或宣称 PH07—PH09 已由旧引擎完成。发布仍服从现有发布政策和具体预览授权，规划建议本身不新增 push/Pages 授权。

## 2. format4 已有能力与明确缺口

| 精确文件/接口 | 可复用事实 | 不具有的能力 |
|---|---|---|
| `src/world/generation-contract.ts:98` `AtlasDraftManifestV4`；`:108` `AtlasDetailCoastDocument` | manifest + 四种 coarse 分层块 + locks + 稀疏细海岸；surface 为权威 fine field | 无国家、城市、首都、政权实体字段；`origin` 固定 null |
| `src/world/model.ts:25–31` `AtlasCatalogs`、`:87` `validateCatalogs` | 仅 `simRegions:{id,name}` 和 `administration:{id,name,parentId,kind}`；稳定数值 ID 与 membership 引用校验 | 不是国家表；行政 branch/leaf 没有国家归属、制度、法理/实控、城市引用。不能把国名塞进 name 就当完整实体 |
| `src/world/generation-format.ts:8` `validateGenerationManifest`；`atlas-format.ts:38` `verifyAtlasDocument` | 精确键、版本、几何、分层/锁/细海岸引用摘要核验 | format4 不能静默添加 `nations`/`cities`/任意 metadata 字段 |
| `src/world/storage.ts:834–851` `ATLAS_DETAIL_COAST_DB`、`getAtlasStorage(4)` | 独立 `lieguoji-atlas-drafts-v4`；`openAtlasDraft/readAtlasBlockPage`、`prepareAtlasCommit/stageAtlasBlocks/commitAtlasPreparation`、`findAtlasReceipt` 现成 | 当前 API 只接已声明 Atlas 格式/附件，不接社会对象；默认具名导出仍指 v1，不能误用 |
| `src/world/transactions.ts:238` `OwnedAtlasSession.prepare`；`:362` `prepareReplacement` | 私有候选、root/revision 绑定、完整核验、确认后发布、撤销 | v4 拒绝旧局部 delta；`:414` 完整替换也禁止改变 catalogs。不能通过现有 `edit(adminMembership)` 新建一个目录项 |
| `src/world/atlas.worker.ts:267`；`atlas-format.ts:49–63` `createGenerationCopy` | 旧格式显式副本路径具备来源核验 | **v4 fork/copy 当前明确拒绝**，不能称已具备 v4→社会世界的显式复制 |
| `src/world/bridge.ts:95–130` `AtlasClient`；`protocol.ts:118–132` `AtlasOperation` | create/restore、地理预览/确认/取消、锁预览/确认/取消、undo | 无国家或城市命令；React 改内存数组不会成为 Worker 权威状态 |

现有读表与几何值得复用，不应重做：`detail-coast-geometry.ts:113` 的 `pickDetailCoastSurface(field,point)` 返回真实裁切后的 land/height/fineCellId，`:96` 的 `buildDetailCoastSurface` 提供同一陆地几何。`detail-coast-base.ts:11` 的 `extractDetailCoastBase` 与 `generation/detail-shape-height.ts` 的 `createDetailShapeBaseSampler` 提供 renderer 当前使用的基础高程采样路线。Worker 建城必须在独立核验的地理快照上调用相同权威判定，不信任前端的 land 标志或 coarse 高程正负。

精确交互缺口：`renderer.ts:767–775` 已取得点击的 world point 和 fine pick，但 `AtlasRendererCallbacks.onPick`（`:25`）目前只回传 coarse cellId 和可选 surface，**未回传真实点击坐标**。后续建城须把 Q8 落点纳入命令；不能默认把城市放在 coarse 重心。fineCellId 与 coarse cellId 也不能互换。`pickDetailCoastSurface` 把零面积零值岸点视作 land，建城还需明确占用范围/正陆地面积条件，不能仅 `land===true` 就批准海岸线上的城市。

## 3. 旧国家/城市能力可以参考规则，不能接管新大陆

- `src/worldgen/types.ts:2–5` 的 `EditorDraft` 是固定 **1000×700** 的旧多边形小地图；`DraftCell.ownerId`、`DraftNation{id,name,color}`、`DraftCity{id,name,cellId,capital}` 相互引用。
- `src/worldgen/engine.ts:163` `addNation`、`:138` `paintStroke(...,'claim',...,nationId)`、`:295` `placeCity` 是真实旧编辑 API；有陆地与国家归属检查、设新首都时撤销该国旧首都标记。可移植其规则意图与回归场景，不可强转 Atlas 为 EditorDraft。
- `validateDraft`（`:351`）只收精确旧封套、最多 1000 cells/50 nations/1000 cities。`compileWorld`（`:323`）把每个陆地 cell 直接编成一省、城市落在 cell 中心，生成军队，再初始化经营；这违反新地图“地理样本不等于模拟实体”的分层要求，且会丢失真实 fine 海岸，不能作为捷径。
- `src/editor/store.ts:3–5,26,34` 的 `Workspace/Envelope/loadWorkspace/saveWorkspace` 保存旧草稿到 `lieguoji-world-studio-v1`，具有校验和、主备和 revision CAS；它不会保存 Atlas fine tiles。
- `src/sim/types.ts:3–5` 的 `Nation.capitalId/regimeId/dynastyId`、`Province.legalOwner/controller`、`City.position/label/provinceId` 是旧运行世界接口；`src/persistence.ts:14,19,60,74` 的 `encodeSave/decodeSave/readSave/writeSave` 只接受引擎注册表支持的旧 World schema/rules。不能只添一个 atlasId 就称新引擎接通。
- `plan/tasks.json:181` 的 M2-002 done 是上述旧工坊成果，不是 PH10 或 PH14 完成证据。旧存档、兼容引擎和原工坊都应保留。

## 4. 依赖就绪后，最小真闭环拆成 3 项

以下是明确的未来实施边界，**不是现在可越门执行的任务状态变更**。文件名为建议新增时明确标记；已有接口以现状为准。不要求先铺家族、信仰、外交等空模型或面板。

**A. 持久社会草稿与一个真实国家（PH10-T1/T2/T3 对应切片）。**

建议新增独立的 `src/world/civilization-contract.ts` / `civilization-format.ts`（尚不存在），只含稳定国家 ID、名称颜色、独立政权引用、可为空的首都引用，以及真实领土法理/实控映射。国家归属是独立语义，不能复用 sim-membership 或把行政叶节点重命名为国家。coarse cell 可作为领土索引，但显示与领土面积必须裁切至其实际 fine 陆地；一格不自动成为一省，也不自动成为城市。

先固定有版本的社会封套、来源绑定与独立身份。当前 v4 不支持新增字段或副本，因而这一步必须补显式“从已保存地理创建社会草稿”的持久路径；原 v4 字节和身份不写。新草稿应拥有其地理内容快照和实体内容，由一个原子 root 同时引用，沿用现有内容 hash、prepare/stage/final CAS、双槽、receipt、容量/锁写原则和地理 codec，**不能拆成两个 DB 先后写并冒称原子**。只保存一个旧 atlas root 字符串也不够：当前 API 只承诺 current/backup 可恢复，没有任意历史 root 的受保护生命周期。具体新封套/domain 的版本号需实施合同时确定，不在本报告假称现成 API。

**B. 建国与领土命令的 Worker 预览→确认→持久→撤销（同 PH10 切片）。**

建议新增 `src/world/civilization-session.ts`，在现有 `transactions.ts`/`atlas.worker.ts`/`protocol.ts`/`bridge.ts` 的真实事务接缝接入独立实体命令；不放宽当前地理替换或 constraints 专用入口。命令绑定社会 root/revision 与地理摘要；私有候选核验稳定 ID、领土存在、归属无歧义，确认 CAS 成功后才发布。第一条真实操作是命名一个国家并确认一块已有陆地的归属；取消/冲突不写、重复 command 重放同 receipt、撤销恢复完整实体引用。海陆、高程、geometry、locks 和所有 fine tile SHA 不变是必须证据，不能仅截图上多一片颜色。

**C. 点选真实首都与统一地图视图（PH14-T1/T2 就绪后）。**

复用 `renderer.ts` 的 screenToWorld→权威 fine pick，扩展精确落点回调；`AtlasStudio.tsx` 只增加一个建国入口和一个首都落点入口。持久 City ID、Q8 实体坐标、独立 label 坐标、国家/领土引用；设置首都是国家引用变更，不靠文字“首都”或重置城市 ID。Worker 复核点在本国实际陆地、占用合法，同国唯一首都；失败解释具体原因。`atlas-label-layer.ts` 仅消费这些已持久实体 ID。预览未确认时可取消，确认后同一国家边界/City ID/落点刷新恢复；再撤销、保存恢复仍一致。地理后续变化必须明确重新校验/事务更新实体，不能让首都静默漂入海里。

第一轮不需要自动分国、自动择址、人物/家族/信仰或启动军队；也不能因此标整项 PH10/PH14 done。最小完成事实是“原玩家地图未被重建；真实国家有领土；真实城市被引用为首都；原因、取消、撤销、刷新恢复和保护检查成立”。后续自动生成和完整系统按原计划继续。

## 5. PH06 必须先解决什么，哪些不是这轮缺陷

1. **T3 当前受测自然细海岸的实际几何/拾取/面积/恢复一致与所要求视觉验收**。preview10 提升和源码可调用不代表已通过；沿根执行者现有检查完成，不另起本报告的重复地形测量。城市必须依赖已核验的持久陆地，不能依赖候选预览像素。
2. **T4 与 format4 实际适用范围的锁、取消、失败保护和恢复闭环**。现有 `LastDetailGeneration.scope` 只允许 world；v4 UI 进入独立 `finePanel`，旧局部 delta 被拒绝。因此不能拿 v2 local landforms/coast 的证据直接关闭 v4 的所有局部编辑要求；未支持项要明确拒绝并保持阶段待办。保持候选取消不写、提交 durable 后不伪装取消成功的当前合同。
3. **v4 社会草稿复制/实体格式缺失属于后继的真接线工作，不应冒充 PH06 已有接口，也不必为 PH06 塞社会数据**。只读备份目前无法由现有 v4 fork 变成可编辑社会档；未来显式复制切片要专门保护这一边界。真机与用户视觉不能由本报告代验，已验工程证据可复用其原限定范围。

本轮基线：`plan/tasks.json` SHA-256 `7d99d76b2180dbfd2ae69ecd7d10417b3508955e885ce884eab2d65ff58883db`；`generation-contract.ts` `0b23c1a41660e01238c4a1becbd76fe2aa1acc955ec2fcab2f176271cb7fbf7a`；`transactions.ts` `368f02ea7cfee00ea5285daa27d016dceec9d0db690b60dc86ba251f59121e3d`。后续若主计划或接口变化，应先重核本文结论；不以文档代替运行事实。
