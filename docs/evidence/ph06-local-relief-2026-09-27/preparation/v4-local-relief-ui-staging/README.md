# V4 局部山地 UI 候选

2026-09-27。仅 staging，生产未修改；未运行单元、lint、typecheck、build 或浏览器。6 项 helper 测试已编写，不能记作通过。

提升范围：一个已有镜像 `src/editor/AtlasStudio.tsx`，三个新文件 `LocalReliefPanel.tsx`、`local-relief-controls.ts`、`local-relief-controls.test.ts`。基线与最终字节见 manifests。原 `DetailCoastPanel`、renderer、bridge、storage 不改。

流程：真实地图陆地点选 → 编辑检查面板「仅重生成山地」→ 以选中基础地块附近 16×16 / 2 格过渡生成**选区**，并不自动运行 → 可调参数或「在地图上重新选择范围」→ 两次可信 tap 选择矩形，第一角必须真实陆地、第二角可在海面，期间不调用会移动相机的 focusCell → 「预览山地变化」→ 「山地生成预览」→ 原有「取消生成」或「确认生成并保存」。保存复用 accept / refreshList，撤销复用原标题栏入口。

新 UI scope 只接受合法矩形、transitionCells 至少 1 且保留核心；无效时阻止预览，不退回 world。地图区域覆盖层复用现有真实 quad 外框/过渡框。精确行列控件放在折叠项中；默认可直接看地图选择。计算、接收、绘制取消继续走已有反馈组件。

新操作使用独立局部种子/起伏状态，保留原画大陆控件。打开新草稿或刷新恢复时，已存 `local-detail-relief` lastApplied 会恢复局部参数与 scope；普通确认/撤销不重置未保存的参数。无真实 land pick（包括只按编号选择）、只读、busy、GPU 锁定或已有候选时不能发起新的山地操作。

预览仅展示 `summary.detailLocalRelief` 的真实 `changedFineNodeCount`、`raisedFineNodeCount`、`loweredFineNodeCount`、`changedFineTileCount`。范围基础地块数量单列，不能冒充实际修改数；0 变化禁用确认。不展示 coarse min/max 为真实细地表极值。

必须和根的 integration staging 一起接入，不能单独在当前旧生产接口下宣称可用：

- `LocalDetailReliefRecipe`，generator `local-detail-relief` / version 1；seed、parameters 仅 `{reliefMeters}`。
- `LOCAL_DETAIL_RELIEF_GENERATOR_FINGERPRINT`。
- `validateLocalDetailReliefRecipe(raw, mode='execute')`，以及 operation 对 `cell-rectangle` 的验证。
- `GenerationPreviewInfo.summary.detailLocalRelief` 上述四计数字段。
- 新 adapter/session 的完整候选生成与保存路径，由根所有；细高程修改/保护由 compute 所有。

拟由根统一验证：六项纯 helper 场景（真实 land 起点、两角选择、边界、scope、不退整图、新配方与恢复），全局类型/lint，以及 surface_format 准备的真实 UI 预览取消→确认→撤销→恢复闭环。本文不代签地理保护、运行进度、性能或用户视觉验收。
