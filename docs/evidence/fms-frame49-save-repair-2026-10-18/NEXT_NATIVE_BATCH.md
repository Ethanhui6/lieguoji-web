# 方案 C 下一批的已证边界

只读原有静态分析索引，未运行原游戏。当前网页 20 tick 虚拟帧已实现；真实逐军、省、国轮转未实现。交接中的 5/10/1 是待落实目标，本轮没有找到其构造默认值或场景覆盖值证据，不据此声称已完整恢复。每日 6 个网页虚拟帧是确定性适配，不证明 Unity FixedUpdate 实际为 60 Hz。

## 原作 ArmyManager

本机忽略材料 `.autopilot/fms-audit/binary/coastline-static/ArmyManager--BatchUpdate.asm.txt`：0x3590E0–0x359125。updateIndex +0x1C，公开 updateBatchSize +0x20，armies +0x30。每轮读当前 Count；游标越界归零，调用 Army.UpdateState（0x35911B → 0x3523E0），游标和循环计数各加一。不是 min(batchSize,Count)，没有去重：若 batchSize=5 且只有 A/B 两军，则 A/B/A/B/A。数值 5 在这里是条件示例。

ArmyManager--Update.asm.txt：先全军分类（0x35D2F8 → GetArmyOrganization）；分类 1 重组，分类 2 收集后 DestroyArmy；最后剩余列表非空才 BatchUpdate（0x35D4E2–0x35D4FA）。已证的是批前清理，不能宣称回调内任意重排/清空安全。

Army.UpdateState 使用 Time.time 与每军上次时间差，见既有 `docs/evidence/fms-throughput-2026-10-09/NATIVE_CADENCE.md` 和 `docs/evidence/fms-continuous-motion-v5-2026-10-05/ORIGINAL_CLOCK.md`。短列表同帧重复不得重复累计整帧时间。完整状态机未恢复。

待核原址：ArmyManager ctor 0x35D6C0，StateManager ctor 0x50E740；ProvinceManager.BatchUpdate 0x46C9E0、StateManager.BatchUpdate 0x508450。不能把 Army 实现未经核查地套给省/国。

## 月结与帧更新分开

ProvinceManager.Update 先 UnitPresenceIndex.Flush（0x471384 → 0x47AD50）再 BatchUpdate。AssignRandomUpdateDays 0x46C870 按当月真实天数为省分配 Range(1,daysInMonth+1)，写 +0x16C；UpdateProvinces 0x47116F–0x471193 对 +0x89 为真且日期相等者 AdvanceOneMonth（0x44FA00）。+0x89 字段含义未核。

StateManager.AssignRandomUpdateDays 0x508270 跳过 null、id0、非存活国家；日期写 +0x2A0；UpdateStates 0x50DA44–0x50DA68 对 IsValid 且匹配日者 AdvanceOneMonth（0x5BF120）。此链与每帧 State.Update 分开。

## 最小实际实现切片

接 `src/fms/play/civilization47-army-ai.ts:issueAutonomousArmyOrders47`：先拆共享上下文/指定军队消费，保留 previewArmyCommand47 → issueArmyOrderOwned47 真实路线与军令副作用；新日志规则持久化游标及每军时间，调整 lastDay/nextTick 和校验。旧世界维持原逻辑。先冻结 b283 Worker，再改规则。

验证短列表重复、批前清理游标、增军/退役/手动军令、批次切分、回放与冷恢复。仅有名单和空回调不算实现；尚未恢复全状态机时，应称“轮转节律下的网页军令适配”。war47-economy 日粮/人口/补给仍原子日结，财政与征募固定30日、外交ISO月分别处理，不按帧重复扣粮或发饷。
