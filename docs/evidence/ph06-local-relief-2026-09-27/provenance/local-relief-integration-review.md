# 局部山地生成接线：独立只读复核

日期：2026-09-27。范围限 `v4-local-relief-integration-staging` 的 contract / format / session / adapter，及 `v4-local-relief-staging` 最新 kernel 的输入、实际差分和返回接口。没有修改候选或生产，没有运行类型检查、单元、浏览器或性能测试；本记录不是运行通过证据。

## 结论

当前读取的接线未发现可复现的阻断缺陷，可以进入根代理安排的受影响合并检查。旧格式拒绝、新配方范围限制、规范存储与确认绑定均保留。实际数值和存储闭环仍需执行已写测试；本次没有复做 UI 或内核完整几何证明审计。

## 已核实边界

1. **v1–3 不执行新配方。** session `preview` 先取得完整私有快照；v1 在 `isGenerationDocument` 处拒绝，v2/3 在“是否 v4”与“是否细生成器”相等检查处拒绝。adapter 自身也要求 `isDetailCoastDocument` 并再做 `cloneVerifiedAtlasDocument`，不把仅形状判别当完整可信输入。对应 session 46–54 行、adapter 22–29 行。

2. **范围没有放宽既有四类 v4 大陆。** contract `validateGenerationOperation` 对 `local-detail-relief` 只接受 `cell-rectangle` 且 `transitionCells >= 1`；普通矩形验证还限制边界及最大过渡宽度，因而至少为 3×3。其他配方仅 `landforms` / `coast-smoothing` 保留原矩形支持；首片 / 追加的两个版本仍须 world。`LastDetailGeneration` 类型也将局部配方与矩形、四类大陆配方与 world 配对。session 写 `lastApplied` 前再次验证此区分。

3. **manifest 仍规范存取。** 新配方 exact fields、整数起伏 200–6000、非空种子、当前/历史指纹模式独立。format 使用 storage 验证来源配方和范围，同时要求只有 v4 可存细配方；v2/3 不因此接受新配方。decode 仍重新规范编码后逐字节匹配，旧版精确封套、origin、引用/内容数量、实际块 hash、锁 hash、fine tile hash 检查均未绕过。v4 `origin` 仍只能为 null。

4. **adapter 只产生细陆地高度改动。** 从已完整验证且已私有化的 base 读取真实 quad、面积重心、高程与全部排序锁。kernel 参数字段及 control 映射与最新接口一致。next 只换 kernel 返回的 `detailCoast`，粗 blocks 和 locks 复用私有 base 的值，新 manifest 从原 manifest 深拷贝，仅重建真实 tile refs；catalogs、粗几何及粗各层没有写入路径。kernel 在首次 await 前复制自己的 buffers 和 fine arrays，故不反向写 adapter base。最后仍调用实际替换锁 guard；session 再核 coarse hash、设置 revision / provenance，并走既有 `prepareReplacement`。

5. **摘要有实际差分依据。** kernel 每个独占 owner 节点只访问一次，仅新旧有效高度不同才增加 changed / raised / lowered，并仅在首次实际写 tile 后计 changed tile；coverage、海岸零点、海床、范围外或保护点高度变化会被末段审计拒绝。adapter `changedCellCount=0` 与固定粗块相符，且拒 `changedCoarseSamples != 0` 或无实际改动。世界/陆海面积来自 coverage 的真实面积汇总，并要求与真实 quad 世界面积一致；已有 summary 字段继续使用既定两倍 Q8² 单位。`majorComponentCount` 明示 coarse-center-4-neighbor；min/max 明示 stored-samples-and-coarse-base，不宣称连续细场全域极值。

6. **取消与提交身份沿旧链保留。** adapter/control、kernel 各检查点与末段审计传播 signal；session 只有全部候选验证后才发布 pending。预览 digest 绑定 recipe / scope / lockSet / summary 和基线；confirm 继续匹配 command / candidate / revision / root 并复核候选 manifest、锁与 preview digest。未新增公开 skip-validation 或无条件信任开关。

## 合并检查的最小必要范围

- 已写的新 session 测试覆盖配方边界、v2/3 执行拒绝、真实预览无落库、伪造确认拒绝、规范 manifest 编解码、确认存取恢复及整图撤销；这些尚未由本次复核运行。
- 建议在同一新测试文件的边界用例顺带明确 v1 执行拒绝、四类既有细配方 rectangle 拒绝、local world / transition 0 /越界拒绝，以及 v2/3 manifest 携带 local `lastApplied` 拒绝。它们是现有分支的窄回归，不需要重跑无关全套。
- UI 与真实 Worker / 浏览器预览、取消、保存、刷新、撤销仍由本批统一运行取得证据；源码只读结论不替代实际功能、视觉、250ms 进度或 500ms 取消预算。

## 明确保留的限制

这是仅细陆地节点高程的局部修改，不增加国家、城市、粗 Hbase 密度或新存档格式。公众输入的同步接管、全路径耗时及浏览器响应没有在此证明；本报告不把内部合作循环等同于性能验收。
