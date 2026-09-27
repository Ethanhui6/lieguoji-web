# Preview 13 区域锁确认与最终恢复成本审计

2026-09-28（香港）。只读审计；未运行测试、浏览器或构建，未修改生产文件。所有时序来自已有 `mobile-first` 失败 trace，不能当作独立性能基准。原 450000 ms 整体期限、断言和操作均保留。

## 结论

移动仿真是在整个工作流已经消耗约 444 秒之后才开始最后一次刷新。最终恢复的 `ready` 并没有独立等待 120 秒；进入此等待时，整体截止前仅剩约 5.9 秒。失败证明当前完整工作流超过原期限，不足以证明恢复死锁，也不能单独归咎新私有 snapshot copy。

明确且可窄修的浪费是：**只改变区域锁的操作，仍销毁并重建完整 v4 地表显示，包括 4,198,401 个真实节点的 CPU 页、GPU 数据及可见纹理**。四次区域锁确认和两次只撤销锁的等待累计 209.689 秒。第一纯锁确认中，进度至少约 10.052 秒停留在重建节点页阶段，随后仍有 GPU/绘制时间。源码无条件分支与实际 trace 一致。

优先加入“已验证文档的地理内容完全相同”显示复用路径。不要先展开 storage/transport 重构；那些链路确有重复全量工作，但同时承担 CAS、不可变原始记录、主备兼容性和跨标签保护，风险显著更大。

## 原始证据和期限解释

- `lock-snapshot-checks/mobile-first/results.json`：`timedOut`，原测试 450000 ms，结果 duration 457025 ms，最后断言位置 spec 第 331 行刷新后 `ready`。
- `lock-snapshot-checks/mobile-first/artifacts/atlas-detail-lock-relief---8ded2-clear-mixed-undo-and-reload-mobile-chromium/trace.zip`，SHA-256 `3ccd6e636cf4300d854b288728c992ea21d65fd391a1c93cc0e4ceebfc5d50cc`。
- 从 ZIP 内 `test.trace` 配对 `before/after`，从 `1-trace.trace` 的真实 locator 日志提取进度阶段；未使用截图估算计算耗时。
- 桌面 `desktop-second/verification.json` 是实际通过：343029.1946 ms、exit 0、sourceAndDistStable true。成功轮没有保留 trace.zip；本报告不把移动时序伪装成桌面时序。

以下为 trace 单调时间（毫秒），不是墙钟：

| 实际动作后的 ready 等待 | 开始 | 持续 |
| --- | ---: | ---: |
| 首次海岸锁确认 | 99468 | 29955 |
| 高程锁确认 | 141332 | 35417 |
| 双锁确认 | 186883 | 34898 |
| 山地确认 | 247448 | 34687 |
| 单独清除海岸锁确认 | 292874 | 35871 |
| 撤销清锁 | 330462 | 36810 |
| 撤销山地 | 368807 | 36445 |
| 撤销双锁 | 407255 | 36738 |

这六个纯锁动作（不含山地确认、撤销山地）累计 209689 ms。四次锁预览各约 6.05 秒；地图缩放的 frameReady 等待还发生数次 3–6 秒开销。上述均是带 Playwright trace、截图和软件环境影响的实际工作流等待，不能推断真实手机帧率。

最后 `page.reload` 开始 445537.677 ms；`ready` 开始 445679.551 ms；超时后的 After Hooks 开始 451554.654 ms。因此最后恢复仅有约 5875 ms 主期限余量。`ready` 的 after 时间产生 12885 ms action duration，包含超时后仍在完成错误截图/清理的区间；不能把 12.885 秒全算为超时前恢复机会。清理使总结果 duration 达 457025 ms。

## 实际恢复与确认链路

最终刷新是新页面，旧显示缓存不能跨刷新直接使用。`atlas.worker.ts:237–252`：

1. `database.openAtlasStorageSession` 打开并固定存档根。
2. `storage.ts:624–630` 调用 `rootContents`；其 339–350 行对当前和备份各调用 `readContent`。
3. `readContent` 的 302–331 行读每个引用、检查 codec、SHA-256、解码，再校验粗格几何/目录。它已经有私有 v4 解码入口，不能笼统说所有这里的验证都重复走公共细场扫描。
4. Worker 从 fixed session 分页取得独立文档；`OwnedAtlasSession.open`（transactions 210–215）仍通过公共完整 ingress 拷贝校验，不是新的 `snapshotAsync` 路径。
5. `initialize`（Worker 179–204）发送全部 coarse blocks、locks 和 fine tiles，每项按真实协议等待 acknowledgement。
6. `bridge.receivedDocument`（152–155）在分片身份/hash检查后仍完成整份文档校验。
7. `AtlasStudio.accept`（90–129）等待 renderer 完成正确帧后才成为 ready。

纯锁确认的不同入口在 Worker 301–318：约束确认 → `replacementDocumentAsync` → 全量 `persist` → publishReplacement → `openStorageSession` 再读当前/备份 → `initialize` 全量传输 → bridge 验证 → 相同 renderer 接收。`persist` 106–144 也对整份 data 的 coarse/locks/detail 内容编码并分批 stage。whole undo 使用相同路线。此次新私有 snapshot copy 不在最终 restore 的关键入口，不能仅凭总体超时认定其退化。

第一纯锁确认的已观察进度点：

| trace 时间 ms | 原始阶段 |
| ---: | --- |
| 99482.643 | 复制完整候选地理块 |
| 99508.383 | 复制完整候选细海岸 |
| 100809.644 | 核验固定版本不可变块 |
| 103857.189 | 编码不可变草稿页 |
| 107952.246 | 核验固定版本不可变块 |
| 112538.628 | 传输已核验草稿块 |
| 113048.778 | 传输真实细海岸 |
| 114074.615 | 接收端核验生成草稿地理块 |
| 114590.567 | 接收端核验细海岸内容摘要 |
| 115104.226 | 创建独立细海岸视图 |
| 115616.592 | 重建真实细地表节点页 |
| 125668.687 | 绘制已核验地理块 |

进度观察离散且可能跳过短阶段，表中相邻时间不是精确函数 self time。

## 显示重算的确定来源

- `renderer.ts:364`：`fullRepaint = fresh || !delta || data.manifest.version === 4`，因此所有 v4 确认都 fullRepaint。
- 367–374：重新创建 coarse `SpatialIndex`，释放所有显示资源，再设置新 data。
- 462–467：不仅清 texture/mesh，也 destroy `DetailTerrainBackend`（CPU 页一起丢弃）。
- 305–327：`warmVisible` 重新建立 DetailTerrainBackend，prepare 和 installGpu。
- `detail-terrain-backend.ts:113–140`：提取 coarse Hbase，然后逐块 pack 全 4,198,401 fine nodes，实际每片 yield；每次锁确认仍从零执行。
- `renderer.ts:167`：v4 terrain texture key 含 manifest revision。即使保留 backend，若只换 revision 而不处理地理内容身份，纹理仍全 miss。

SpatialIndex 建的是粗格索引，不是海岸 mesh。地图上的细海岸语义由既有采样/真实节点页维持。不要把前者命名成海岸生成。

手工看到“描绘海岸”也不是生成算法正在改变海岸的直接证据：`atlas-generation-progress.ts` 在 copy/read 之前匹配 `海岸`，所以“复制完整候选细海岸”“传输真实细海岸”也显示这个标签。锁操作在存档层维持精确 coarse/fine hashes 的断言已在此前步骤通过；本审计发现的是冗余显示准备，不是锁命令暗改海岸。

## 窄修复边界与验收建议

只对已经过现有 bridge/Worker 完整验证的 v4 immutable views，比较同一 draftId、atlasId、version、完整 spec、surface contract、全部 coarse blockRefs 以及完整 detailCoast contract/refs。其地理输入完全一致时才复用；只比 coverage、粗格 geometry、revision 或数量都不够。任一高程/Hbase/fine hash、规格或地表合同变化必须走原来重建路径。不得接受调用方的 `trusted` 布尔开关，也不得修改公共 raw ingress 来实现复用。

保持当前 data/head/revision/constraints 更新，并仍等待一次正确帧再 ready。保持取消后 fail-lock、context epoch检查、GPU恢复、准确内存记账和 draft切换清理。该优化不改变保存或备份原子提交语义。

实现需要同时处理三点，避免表面复用：

1. backend 的 CPU field、GPU来源与当前显示身份一致。`DetailTerrainBackend.data` 目前 readonly；`warmVisible` 315 行要求引用相等。可增加受控同地理 rebind 或专用地理 source绑定，不可直接删这条检查。
2. v4纹理 identity 改用同一地理内容的稳定标识，不因只改锁的 manifest revision 失效。原地理真正变化时仍必须换标识；不能只固定一个常量。
3. SpatialIndex 同 geometry dependency 的现有 189–192 快路径不重建，但它保持原 `data` 引用。几何仍相同，旧 immutable geometry可作为同内容来源；若设计要求新引用，必须显式验证后rebind，不把任意data写入缓存。

建议先限定锁/元数据的 durable accept。同内容 generation-preview→confirm 也有复用机会，但必须比较当前显示的候选，而非只比较 committed baseline；若包含，需单独覆盖候选确认/取消恢复行为，不能无条件套用。

所需有效证据：同地理锁确认/锁撤销不重新生成节点页，当前 revision及锁查询仍更新；真实local relief、undo relief、不同draft/spec/surface/fine高度变化仍重新准备；保存恢复、失效/取消/GPU恢复保持原断言。然后运行原450秒完整浏览器流程，不删步骤、不放宽期限。新的自然山系候选属于独立功能，不可用它掩盖此失败。

## 审计读取的源身份

| 文件 | SHA-256 |
| --- | --- |
| src/world/renderer.ts | 1e0c4abf539ab3179f839a70ac173b424e9729c0cce8336de04391265c8964a4 |
| src/world/detail-terrain-backend.ts | d9200a2218915a9f2b21e650e38ff505f6706ff9aa23a10df419c30a6c51888b |
| src/world/atlas.worker.ts | 6bbc49c5d20df6111a76a08b250f403e5e4336de1b6aa6716052731cd3c413f8 |
| src/world/bridge.ts | 17aa39ac8e090d402f16f3db7c930e0b821865e38c0ace0d9a9a31dcedbbd658 |
| src/world/storage.ts | 46d93b707fe20b1136c8008d474e56460cdcb156bc5e710246250e1f0ba3e038 |
| src/world/spatial-index.ts | 5ee407033405d3405ee32a2af35db04c25e8f2f6ac581e9059d80a627ffb0adb |
| src/editor/atlas-generation-progress.ts | ae5190ae02da926dcaf8f382595974eeb7f7d99919db733c68d6be4d89b4ebff |

没有独立浏览器 profiler/self-time，也没有真实手机硬件数据；不能为全部重复校验计算精确占比。此报告只对 trace时序、确定执行分支和可保留安全边界的窄优化负责。
