# v4 区域保护 UI 候选

本目录仅暂存 UI 候选，生产文件未修改。状态：written-unchecked。没有执行 lint、typecheck、单元、构建、浏览器或性能检查。

## 后端确认

- `atlas.worker.ts` 的 constraints-preview / confirm / discard 路由接受当前格式 4；只读备份继续拒绝编辑。
- `transactions.ts::prepareConstraints` 接受生成版本（包括 v4），计算真正改变的 flags，set 使用按位或，clear 只清指定 bit；没有变化则明确拒绝。候选经过已有完整核验和纯锁事务保护。
- `generation-locks.ts::assertAtlasConstraintsOnly` 对 v4 核验粗地理块及细海岸内容全部不变，manifest 除 revision / constraints 外必须相同。
- Worker 最终调用现有约束专用持久提交；确认身份、CAS、取消及完整撤销沿原链。本候选没有修改任何以上后端文件。

## 4 个晋升目标

1. `src/editor/AtlasStudio.tsx`：基于已晋升 preview12 的实际文件。新增 protect 模式、独立 protectionRegion / 两点选择状态，复用 previewLocks / confirmLocks / discardLocks。保留局部山地的 region、transition、seed、relief；不修改旧版 generatePanel。
2. `src/editor/RegionProtectionPanel.tsx`：实际范围输入、bit 1/2/3 与 set/clear、真实 changedCellCount 预览、确认/取消。
3. `src/editor/region-protection-controls.ts`：两点到矩形、单格有效、海陆均可选择、提交前输入校验与独立快照。
4. `src/editor/region-protection-controls.test.ts`：5 个纯 helper 场景已写，未运行。覆盖任意地块起点、反向角点/世界边缘、失效角点、六种 mask/action 的准确保留与无别名、非法输入拒绝。

`finish-ui.mjs` 仅为本次暂存编辑脚本，不晋升，不需要重新执行。

## 真实入口及稳定名称

- 原生点击地块进入编辑面板 → `保护区域`；任何海/陆地块均可，默认所选地块 1×1。每次重开按当前选中地块重置锁范围，但保留 mask/action；山地范围和参数独立保存于本次会话状态。
- `在地图上选择保护范围`：两次可信地图点选，反向角点可用，再点同格即可选 1×1；不调用 focusCell，保留拖动与双指缩放。Escape、`取消选择范围`、导航、绘制、运行、图形中断均结束本笔选择，不写存档。
- `精确调整保护范围`，aria：`保护选区起始列` / `保护选区起始行` / `保护选区宽度` / `保护选区高度`。
- select aria `区域锁保护内容`：1 仅海岸，2 仅高程，3 海岸与高程。`区域锁操作`：set 锁定选区，clear 解除所选保护。
- `预览区域锁修改` → region aria `区域锁修改预览`，testid `region-protection-changed-cells` 来自 Worker 的实际差分。
- `取消区域锁修改` / `确认区域锁并保存` / 顶部 `撤销大世界编辑` 均复用原链。
- testid `region-protection-scope` 显示选择尺寸，明确不等于实际修改数量。预览范围取 immutable preview.rectangle。
- `返回地貌创作` 恢复进入保护前的 draw/local 模式及原局部山地控制。当前保护状态仍在原选中地块详情展示，不增加虚构锁热图。

## 待统一检查

根代理按 baseline-manifest 核对后受控提升，执行 owned helper 5 项和全局静态，再与准备中的真实锁/局部山地浏览器流程统一检查。需实测保存、取消、单 bit 解除、混合撤销、刷新恢复以及细地形保护。本候选本身不构成测试通过或性能验收。
