# 接回统一 Army47 前的审查记录

本轮 UI 插入批优先，三份 `army-travel47-graph.ts`、`army-travel47-state.ts`、`native-war/army-path.ts` 仍未接入生产，不是可用的跨海 Army 系统。不运行原作或恢复脚本、不重复恢复已有叶函数。

- 图构建目前把共享多边形边都连接，存在海面被 h20/h20 干脊隔开的两面重新直连的风险。同海面邻接必须尊重原 `seaGraph`，补干脊隔离与有效绕行样例。
- `advanceArmyTravel47` 只在 offset=0 检查下一格权限。已经离开格心但尚未过共享边时停战，仍可能继续越界。接入时明确边界重验与停在边界的持久化状态，不将“完成航段”冒充“停战后禁止新越界”。
- 原作 GetNeighborDistance 0x802CF0 / clone 0x7FCED0 有简化距离分支；固定 octile 只能称明确适配。海路线 .02 仅指定目的 oceanRouteCellSet，不能解释成全部海面或物理速度。非港转换 +450 为软惩罚，无必须己方 Navy/运输容量硬条件；海上 Army speed 为 base×1.5，完整绝对时标仍未知。
- 原生省级路径的海路线 .05、沿海 .2、不可征服空白国家 ×30 与格级层不同，不以当前 scalar helper 声称战略寻路完整还原。
- 同一 Army ID / 独立混合状态需真正进入 Worker、checksum、快照、保存和渲染。旧省 ID 只能是兼容锚点。不能跑完 v46 tick 后再追加位移；必须避免海上部队仍在出发省接敌、占领、补粮、驻防或自动装船。

详细静态证据已有 `.autopilot/paths47-native.txt`、`pathcost47-native.txt`、`pathdistance47-native.txt`，原 DLL SHA256 `d42658a922155f6cc60295a64c02207e5eaa1d3a55fd5ed18dc8ecc562f9b82b`。路线与战斗真实闭环后接 WEB-04-38 海域控制，再接文化和排队研究，不用本记录另起空计划。
