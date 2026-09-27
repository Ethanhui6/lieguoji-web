# v4 区域保护提交：复用未改变的显示地理候选

仅两个候选文件：`src/world/renderer.ts` 镜像，以及新 `src/world/renderer-detail-reuse.test.ts`。未改生产、旧背景冻结区、bridge、存储、传输协议或验证器；未执行测试、构建或浏览器。所有描述是静态实现范围，不能作耗时或功能通过证据。

## 实际路径

本次检查的 `AtlasStudio.tsx:397–405`：`previewLocks()` 等待 `client.previewConstraints()` 后只设锁预览、范围叠层和文字，**没有**调用 `renderer.showGenerationPreview()`。`confirmLocks()` 才将经过客户端独立完整验证的持久结果交给 `renderer.accept()`。`discardLocks()` 不替换 renderer 地图。真实地貌的 `previewTerrain()` 才调用 `showGenerationPreview()`。

所以当前四次锁确认和锁撤销都从 `committed` 显示进入 accept。本窄修改可以命中这些真实入口，而不是假设一种只在单元测试存在的锁路径。真正生成预览的确认、取消仍走完整旧路径，未顺带改变其边界。

`restore_cost` 的只读记录在 `.autopilot/ph06/lock-restore-cost-review.md`：锁确认再次建立空间索引、销毁细场页、重建 4,198,401 节点页并绘制。手机四次确认30—36秒、三次撤销36—37秒是既有检查轨迹；本候选没有新的性能数据。最后刷新当时全程截止仅余约5.9秒，本次不改测试时限。

## 复用准入与资源身份

只准入当前为已提交显示、当前对象与 committed 数据和索引引用一致、GPU ready、细场 CPU 完成、纹理和地理缓存非空，且旧 backend 与新已验证来源的以下项全部相同：

- format、kind、draftId、atlasId、版本4；
- 完整 spec、surface；
- 全部 coarse blockRefs（包括 geometry、elevation、sim-membership、admin-membership），不是只比较一个修改提示；
- 完整 detailCoast 合同与 refs 目录。

这些比较是已完整验证、拥有且不可变的内部 receiver 快照之间的缓存依赖比较，**不能替代**真正字节验证。`bridge.receivedDocument()` 的 `verifyAtlasDocument()` 没有改动；不接受 `delta` 的空 dirtyKeys 为细地理相同证据。

通过后仅替换 renderer 当前 metadata 来源和私有 detail 显示绑定；旧 SpatialIndex 和 DetailTerrainBackend 继续拥有其已经核验、内容相等的不可变地理来源。`SpatialIndex.updateGeometry()` 的相同 hash 分支并不会换内部 data，本候选也不假装它换了；点选需要的几何/实际细高程仍完全相同。新的 `this.data` / committed / revision / label /锁详情都采用新资料。

纹理键中的 v4 地理 revision 改为持有 backend 的来源 revision，防止仅 metadata 增加 revision 就使相同地理 RT 全失效。只要真实地理改变，旧 backend 被原完整流程销毁，新 backend 与新 revision 共同替换。独立草稿和格式边界仍必须全重建或由原合同拒绝。完整资源释放同时清除私有绑定；GPU loss 保留 CPU 页的旧有恢复机制保持不变。

准入检查和私有绑定之间没有 await。后续 warmVisible、epoch、正确帧、取消/销毁检查仍保留；持久结果取消显示依然锁编辑，明确“草稿已保存，未回滚”。若调用开始时 GPU lost、缓存缺失或任一地理依赖不同，就进入原全重建路径。若后续 await 间 GPU 丢失，原恢复机制重建 GPU，并仍等待实际正确帧，不会把旧 GPU 内容当成功。

## 编写而未执行的证据

新测试有 8 个实例（包括 coarse/fine 参数化2例）：

1. 真实128²第四版来源和非零锁，确认/撤销更新当前锁数据、标签、revision；检查真实 SpatialIndex 不重建、cache无重造、依然等待正确帧；旧地理底层点选仍返回实际细高程。
2. 每类身份、spec、surface、coarse层与fine目录变化均不能通过依赖比较。
3. 真实修改并重新哈希/验证的 coarse 和 fine 高程，即使空 delta 也必须完整重建。
4. 无纹理缓存拒绝快捷复用。
5. 调用开始时 GPU loss 等待恢复并完整重建。
6. 取消 metadata acceptance 不发布新修订、不伪装回滚、不改来源。
7. 真正 `generation-preview` 显示模式的确认仍走旧完整替换，即使此测试构造的候选地理相同，也不放宽模式边界。

测试保留真实地图构建/验证、SpatialIndex 与资源缓存；替换 GPU/Pixi 边界以及完整细场页打包成本。它不能证明 GPU 像素、手机耗时或浏览器保存链；根仍需真实 browser 验证。未运行上述测试，不提前声明 PASS。
