# PH07：权威细地形水文快照切片

本切片已按 root 后续授权提升到 `src/world/hydrology-snapshot.ts` 与 `.test.ts`，并同时提升已归档修复内核 `src/world/hydrology-kernel.ts` 与 `.test.ts`。只有这四个生产文件归本切片所有；没有改地理格式、生成器、UI、Worker、持久化、版本或任务状态。其他工作者正在接线。

## 单一真实入口

`extractOwnedHydrologySnapshot(session, { expected, rectangle }, control)` 只接受真实第四版 `OwnedAtlasSession`；以其一次 `snapshotAsync` 获取私有、内容摘要完整校验后的地图。没有公开 raw document 快捷入口，没有再次 `cloneVerifiedAtlasDocument` 复制全图。

`expected` 精确包含 `draftId / revision / manifestDigest / rootDigest`；`rectangle` 是固定 2-world 细格点的 `originColumn / originRow / columns / rows`。请求在首次等待前捕获；每个控制回调、让步和异步摘要后重验会话身份。`rootDigest` 仅绑定当前 Owned 会话 head，**不表示本函数重新读取或认证了 IndexedDB 持久 root**。源版本变化会拒绝本次结果。

返回 `source / kernelInput / boundary / locks / stats`。`source` 额外绑定实际 `atlasId`、锁集合摘要、`version:4` 与 `rootBinding:'current-owned-session-head'`；`kernelInput` 可直接交给已归档纯内核。`boundary` 区分真实世界边界与裁剪边界，但不虚构外部排水出口。锁引用和数量保持原地理锁语义；它们不是河流屏障，也不屏蔽读取的真实高程。

## 地理与内存契约

- 单次矩形每边 2–512 个节点、至多 262,144 节点；全世界节点坐标 0–2048。输出两个新 `Int16Array` 合计 `4N` 字节，最多 1 MiB。越界、身份无效在调用 `snapshotAsync` 前拒绝。
- 始终使用真实 `detailCoastNodeOwner` 与 `sampleDetailCoastNode`，保留 tile 接缝的唯一节点所有权。显式 `samples` 的覆盖值和整数物理高程逐节点原样读取，没有粗格重采样、随机河线或地理修改。
- 仅窗口存在 `land`/缺省 sea owner 时，使用现有 `extractDetailCoastBase` 的真实共享四边形重心与保存高程，再用现有 `createDetailShapeBaseSampler` 解释原 v4 Hbase。均匀 land 强制陆地/非负高度，缺省 sea 保持海地与负高程；不因粗高程为正制造陆桥。
- 除输出外，入口仍需要一次完整私有源快照。复杂度是 `O(S + C + N)`（全源内容 S、必要时粗地理节点 C、窗口 N），并非只有窗口的内存/成本；输出预算不等于完整工作集预算。C 上限仍由已验证地图规格 512² 控制。
- owner 扫描、锁读取、输出采样每 512 项让步；全图快照沿用已有分批和取消。既有 Hbase sampler 的同步准备仍有有界复制/校验成本，本切片没有证明严格毫秒响应预算。全世界 2049² 水文拼接、跨窗口解析/河流接线和移动真机性能仍是后续工作。

## 实际检查

基线提交 `d742a6e917c723bf22f31768efa00b268f48d5b0`。每轮目录保留源副本、相关导入依赖 SHA、前后核验、完整日志与 JSON；源清单为测试的静态相对导入闭包及检查配置，非全工作区摘要。

1. `checks/first-owned-snapshot`：局部 types 通过；11 项中 10 项通过。新测试错误地将裁剪流域期望为完整 ocean 状态。原内核按既有合同把接触裁剪边缘的上游标为 unresolved，并保留已观察到的 ocean 终点。
2. `checks/crop-partial-expectation-fix`：只修新测试语义，增加 `partial=1` 与 `terminalKind=ocean` 断言；原 12-world 窄海峡、两岸出口 x=57/69、不跨海等断言保持。局部 types 与 11/11 通过；实现未为此修改。
3. `checks/production-normal-imports`：提升后使用生产正常相对 import，没有虚拟别名。局部 types 0 diagnostics，27/27（已归档内核 16 + 新快照 11）通过；本轮跟踪源 SHA 前后不变。未执行全工程检查、build、浏览器或性能测试；不可将它当作产品接线、自然视觉或完整 PH07 验收。

合成检查使用真实 `createGenerationDraft` 第四版文档、原共享地理几何、实际内容哈希、锁集合、Owned 会话快照和真实细 owner；保留 12-world 海峡跨 tile 接缝，检查显式/隐式 owner、高程、全世界边缘、错误身份/非法预算、旧格式拒绝、取消、复制摘要损坏、私有隔离与实际 publishReplacement 后拒绝陈旧结果。

内核源字节保持已归档 `e7f12a9fb46c6f6a456e0f46ab073c6cffe0d62541056bd97bc3ed4e30cb1742`；内核测试仅将原跨目录 import 改为正式同级 import，没有删改原断言。快照及其测试 SHA 见 ready-manifest.json。
