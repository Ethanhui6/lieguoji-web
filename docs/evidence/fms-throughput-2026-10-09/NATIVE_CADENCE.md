# 原作时间与军事调用频率复核

日期：2026-10-09。用户本轮反馈“进度时间太慢了，还不如旧版和原版”。根独占写入，native_clock_audit 与 live_perf_audit 并行只读分析；不是亲自运行原作计时。

## 已核实的原作边界

对象仍为授权安装目录中的 Windows Unity PE / IL2CPP，不是 ELF/DWARF，也没有获得原始 C# 工程。原始指令与完整 dump 留在忽略目录，不入游戏产物。

| 调用 | RVA | 本轮确认 |
| --- | --- | --- |
| World.FixedUpdate → UpdateManager | 0x6AD1E0 → 0x6C8E90 | 世界管理器调用时间、陆军、海军管理器 |
| TimeManager.Update | 0x523F10 | 累计 Time.deltaTime，按 gameTime / secondsPerDay 推导日期，处理实际跨过的日期边界 |
| ArmyManager.Update → BatchUpdate | 0x35D060 → 0x359010 | 分批轮转单位，Army.UpdateState（0x3523E0）使用 Time.time 与该单位上次更新时间差 |
| NavyManager.Update → BatchUpdate | 0x431090 → 0x42D3F0 | 读取 deltaTime（0x43143D），调用 Navy.UpdateState(float)（0x427590）；不能自动假定与 Army 相同的累计方式 |
| Army 移动协程 | 0x378767 / 0x37878D / 0x3787D9 | deltaTime、速度乘法、实际 Transform 位置写入 |

默认日长的 float32 0.1 秒证据沿用并复核 [ORIGINAL_CLOCK](../fms-continuous-motion-v5-2026-10-05/ORIGINAL_CLOCK.md)。这代表配置目标，不代表本轮实测桌面原作能在任意负载下达到 10 日/秒。Unity fixedDeltaTime、最大补时以及各平台实际帧率未核实，不能写成固定 50Hz。

## 网页当前负载错配

120 tick/日是网页早期 3 秒/日方案的设计，见 [早期交付](../fms-realtime-v5-2026-10-05/DELIVERY.md) 和 [战术恢复](../fms-tactics-v5-2026-10-06/RECOVERY.md)。由 3 秒/日改为 0.1 秒/日后，若所有刻度仍执行全套军事工作，目标负载从每秒 40 tick 变为每秒 1200 tick，4 倍速达到每秒 4800 tick。这个 30 倍是计算目标的比值，不是测得 CPU 时间比值。

原作证据支持累计时间和分批单位更新，不支持“每游戏日必须全军更新 120 次”。当前性能不足不能继续仅调小日长、调高倍率或提前更改显示日期。

## 本轮实际修复与后续边界

本轮保持全部逻辑刻度、攻击截止点、随机抽取与日结顺序：只移除重复验证/复制/空间读数，减少大图传输，采用最多四个完整日内动作的原子显示批次。4 日新旧引擎完整 run 与 frame 对照已通过，范围仅覆盖固定正常大陆样例；不是所有世界等价证明。

下一批应沿现有实际事件边界减负：首先复用海军自主部署同一次 navalPresence 已构建的 spatial.space；随后对路线端点、接触/齐射期限、撤退到期、失港/和平/死亡、AI 到期及日/月/年结算建立明确失效条件。不能直接除掉 120、跳过接触或合并有随机副作用的单位更新。

当前没有“将旧 47 存档迁移到新内核”的显式复制接口。旧档继续原冻结引擎，新优化世界使用新指纹；后续若迁移，必须独立库、明确副本、旧档永久保留和双引擎重放核对，不能只重写 engine/id。保存的 current/backup 两槽不能替代迁移前永久备份。

## 2026-10-10 后续只读复核补充

已保存的授权安装包反汇编补足了上表 Navy 的累计时间细节：Navy.UpdateState 在 0x4276B9 读 Time.time；上次更新时间为正时在 0x4276CE 使用 now-lastUpdate，0x4276D8 回写本次时间；旧值不为正才使用传入 deltaTime，负差回退 max(0,deltaTime)。累计 elapsed 在 0x427A2B 传入 BattleInSeaProvince(0x4211A0)，海战命中即退出本次状态更新，未命中才进入攻击/闲置。此段以现有 `.autopilot/naval40-role-native.txt` 的67–84、254–278行为证据；本轮未运行完整原作或新的恢复脚本。

RefreshAttackDeploymentIfNeeded 在0x43025A读unscaledTime、0x43026D加1.0，确认部署刷新是1个非缩放秒。NavyManager声明默认批量5，但运行字段可变；ArmyManager默认批量和两者完整轮转/销毁顺序仍未恢复，不把“每批5军”冒充已证规则。当前网页40tick桥接不等同这一原生时钟。

这支持下一独立切片：保留120作为时间戳单位，以几何/接触、攻击期限、撤退、AI、港口易手和日界调度昂贵观察；不能盲跳接触或补造攻击。合并运动dt会改变浮点加法分组，须建立新内核的分批/重放不变性，不能宣称与旧120次积分逐字相等。原港口float32恢复→攻击可先保留纯数值子循环，直到首次易手返回主循环。当前已完成的观察缓存仍保留全部120细步，和这个未来切片明确分开。
