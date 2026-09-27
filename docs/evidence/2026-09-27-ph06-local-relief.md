# PH06 既有大陆局部山地编辑：preview.12

2026-09-27：真实局部山地的预览、取消、确认保存、撤销和刷新恢复通过限定功能检查。PH06-T3/T4仍为 `in_progress`；自然外观、用户视觉、真机和性能均未验收。没有云端写入。

玩家现在可以点已有陆地，选择“仅重生成山地”，在地图点两个对角，调整种子和200—6000米起伏，再预览、确认。范围外、海岸覆盖、海床、所有粗地理块和已有锁保持原样。新配方 `local-detail-relief@1` 产生真正的细节点高度；不以着色代替地理，也没有声称加入侵蚀、水系或植被。规则与保守边界见 [ADR0020](../adr/0020-local-detail-relief.md)。

实际构建为 `0.5.0-preview.12`，构建基础HEAD为 `f49da8377985ef041a56dde7f995b2c8af018b3b`，归档时产品修改尚未提交，不能单独用HEAD代表完整源码。`dist/build.json` SHA256：`72d0ea66e58a6e1b966d5fbae5e4a03ccc10aea2de90e6aed116865f9ea4d305`。4173实际HTTP响应和本地文件一致。生成器身份由10增至11，新身份包括kernel与adapter完整依赖；旧闭包因合同/history变化而改变，模拟引擎指纹未变。不能把预期的旧生成器变化误称引擎改变。

修改合同前，preview.11实际10闭包、37份源码原件已经冻结并逐项重新计算，见 [历史来源](ph06-preview11-generator-history-2026-09-27/provenance.json)。归档41文件（含inventory），来源快照摘要 `d57059774d14255bd85921935f5326288a9fc05dcd4b7f690ff129eb0114355c`。旧格式及旧来源仍按原身份读取；不静默迁移，也不把旧来源登记为新配方可执行身份。

| 实际检查 | 结果及边界 |
| --- | --- |
| 根单元 | 八文件59/59，首轮16718.3807ms。含kernel10、session3、UI helper6、历史4，以及合同/格式/原细生成会话/指纹回归。不是全world重跑。 |
| 根静态与构建 | 计划校验、全局lint、类型检查、实际生产构建及25项dist白名单审计均exit0，前后源码稳定。 |
| 桌面实际产品 | `atlas-local-relief.spec.ts`，228822.3123ms，exit0、0重试。 |
| 手机仿真 | 同一实际spec，232426.3794ms，exit0、0重试，原生触摸操作。 |
| 平板仿真 | 同一实际spec，280668.6642ms，exit0、0重试，原生触摸操作。 |

三个浏览器均从真实画大陆并保存开始，点击实际已保存细节点所在陆地，局部预览取消后核对持久库不变；再次确定性预览后保存，核对真实细高程改变、粗块/coverage/锁字节不变；整次撤销恢复基线，再生成、保存、刷新并验证实际字节与控件。各端source/dist稳定，原450秒限没有放宽。此次新世界锁集合为空，因此“锁字节不变”不构成非零锁冲突的产品验收；下一批继续实际锁入口。候选书写的测试没有重复计数为额外通过。

root另在IAB已保存的“群岬长陆”修订1上操作：两个原生角点选出45×30范围，过渡2格、种子“群岬北岭-01”、起伏3200米。预览实际改变82,829节点，其中抬升71,143、降低11,686，变化96分块；确认保存为修订2，刷新恢复修订2和相同参数。对照 [预览](ph06-local-relief-2026-09-27/observations/manual-preview.png)、[刷新全图](ph06-local-relief-2026-09-27/observations/manual-restored.png)、[参数恢复](ph06-local-relief-2026-09-27/observations/manual-restored-controls.png)。控制台warning/error为空，没有导出真实存档。

手工尝试在运行时点取消，操作先完成，按钮查询没有匹配；这次失败如实保留在 [观察记录](ph06-local-relief-2026-09-27/observations/manual-observation.json)，不算运行中取消成功或取消延迟测量。浏览器功能用例的候选取消检查另计。手工IAB与手机后段/平板前段有重叠，所有runner耗时均不是性能基准。

观察接受范围仅 `localReliefWorkflowAccepted=true`。地图中长山脉仍有折线，局部山地仍像鼓包，整体自然视觉保持false。新Atlas尚无国家、行政区、城市、军队和战争，用户要求未整体实现。旧光照与自然生成证据只按未变范围引用，不能重新计为本构建新执行。公开输入完整核验、私有snapshot大复制、非零区域锁、更多自然地貌种子仍需后续验证。

完整 [原始归档](ph06-local-relief-2026-09-27/verification.json) 共80文件，inventory记录79项排除自身，pending0，`technicalPassed`、`allRequiredPassed`与限定的工作流接受为true；`naturalVisualAccepted`、`visualAccepted`、`allAccepted`、`phaseAccepted`、`physicalDeviceAccepted`、`performanceAccepted`、`cloudWrites`均为false。原日志、源码快照、trace、截图、提升和审查记录均保留，历史大包只作哈希引用。
