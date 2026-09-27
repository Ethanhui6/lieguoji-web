# v4 追加大陆接线独立只读审查

日期：2026-09-27。审查者：shape_generator。基线由主代理报告为本地提交 `337afb7`。

本次仅审查 `.autopilot/ph06/v4-additive-integration-staging/ready-manifest.json` 所冻结的 adapter、session、合同/历史与锁接线；只核查追加内核采用共享保护函数的差异，不重新进行内核算法验收。未改生产、测试、其他 staging 或正式任务记录，未运行测试、浏览器、构建或性能测量。本文件是新增审查产物。

## 结论与已处理问题

本范围内未发现尚未处理的产品正确性阻断。追加配方保持独立身份；输入先取得经过完整验证的私有副本，再从真实地理提取锁和四边形。候选准备及最终存储提交均调用真实细片锁保护，最终仍有当前/备份根和内容快照的原子 CAS。该结论是静态审查，不代表提升后的测试、性能或视觉已通过。

发现一项确定的提升路径问题，主代理已修复：staging 中 `src/world/detail-add-history.test.ts:9` 使用 `../../evidence/preview7/`，原样提升后会解析为项目根 `evidence/preview7/`，而该目录不存在，导致历史测试收集阶段 ENOENT。主代理将真实 build、provenance 与 27 份闭包源归档到 `docs/evidence/ph06-preview7-generator-history-2026-09-27/`，并只调整测试相对路径。本次已只读确认实际测试指向新目录，build/provenance 文件存在；未重新执行闭包摘要测试，也未将该修复称为测试通过。

## 核查依据

- `generation/detail-shape-add-adapter.ts:24–43` 从完整私有 v4 文档逐格读取全部实际锁位，并通过 `quadQ` 取得真实四边形，不接受 UI 提供的“无锁”等授权标记。只复制改变的高程块，非高程块、成员关系、几何、锁、目录保持原来源。细块重新以真实 codec/hash 注册；summary 总面积同时约束为真实世界面积。
- `generation/detail-shape-add.ts:91–95,159–201,218–223` 的原有保留逻辑把零覆盖节点视作陆地，并冻结其邻接节点；旧陆地对应粗控制高度不替换，受新 Hbase 影响的旧隐式节点必要时物化，随后比较实际旧细片坐标和高度。本次内核唯一保护语义变化是将两项私有锁比较改为共享 `assertDetailCoastCellProtection`。未发现接线绕过旧陆地检查的分支。
- `detail-coast-locks.ts:16–47` 比较真实三角坐标、面积、岸线端点及 owner；另比较四个有效源节点的海陆归属，补足孤立零面积陆点无法从正面积片判断的问题。高程锁比较实际片高度及源节点高度，包含隐式 Hbase。mask 1 不冒充高度锁，mask 2 不仅看粗中心高度。
- `detail-coast-locks.ts:81–147` 用 base 的真实 quad 做 SAT 覆盖，touching 计入保护；读共享边的稀疏 owner 和零线依赖。锁区采样按显示 tile 局部构建，每次最多保留前后两份 32×32 细格表面，不建立全图 mesh。即使没有锁，仍要求本阶段粗几何与所有非高程层不变。该容量检查不是 250 ms 性能证明。
- `generation-locks.ts:117–141` 在异步细片检查前检查版本、草稿/Atlas 身份、规格、surface、origin、完整锁目录及锁字节。旧格式继续调用原同步行为；v4 不支持的局部编辑仍有显式保守边界。
- `transactions.ts:400–432` 在完整 public 输入接管/验证后进行异步保护，并在其返回后及记录候选前重新检查私有 source 身份、root、manifest 和取消信号。`storage.ts:302–330,509–540` 从固定 manifest 逐块解码、身份/hash 核验成私有数据后再次保护，最后一个 readwrite 事务核对先前读到的全部保护行与 CAS。没有公开跳过验证开关。
- `generation-session.ts:41–52,115–143` 将新配方限制在 v4 + world；lastApplied 绑定父 revision、manifest/root 摘要、lockSetDigest。确认继续绑定 candidate/command/preview digest 与当前根，不凭新 recipe 的存在直接写档。取消发生在候选准备后的摘要阶段时会 discard；提交完成后的迟到取消仍按已提交回执处理，避免误报“未保存”。
- `generation-contract.ts:147–150,260–294` 对新 id、版本、完整参数、scope 和 current fingerprint 严格验证；历史白名单仅 storage 模式接受。`generation-format.ts` 对 v4 只接受 first/add 两类来源，旧格式不能借历史 mode 执行新配方。`scripts/generator-fingerprint.ts:61–62` 以实际追加 adapter 为入口遍历运行时依赖；Vite define 与 build metadata 使用计算结果，没有手填 new SHA。首次大陆内核并未被改成追加语义。

## 提升后最小验证范围

建议一次串行运行以下 30 个已有独立场景，保留第一轮原始结果，不先扩大成全历史重复运行：

| 文件 | 场景数 | 本轮必要性 |
| --- | ---: | --- |
| `src/world/detail-add-integration.test.ts` | 3 | 首片与第二片真实 session/storage、刷新字节恢复、第三次取消、仅撤销第二片、实际锁/重叠拒绝、CAS 与格式隔离 |
| `src/world/detail-add-history.test.ts` | 3 | 提升后的归档路径、7 个真实旧运行闭包、旧配方 storage-only、跨 id/未来版本拒绝 |
| `src/world/detail-coast-locks.test.ts` | 16 | 真实边缘 quad、稀疏边界、孤立零节点/零线 owner、隐式 Hbase、高程/岸线独立语义、取消和最终提交防线 |
| `src/world/generation/detail-shape-add.test.ts` | 8 | 内核现在调用共享锁函数，先前独立内核 8 项不能直接代表修改后的运行依赖已通过 |

锁测试源来自 `.autopilot/ph06/v4-lock-staging/src/world/detail-coast-locks.test.ts`，内核测试源来自 `.autopilot/ph06/v4-additive-staging/src/world/generation/detail-shape-add.test.ts`，二者不是 integration ready 的同一份测试文件集；提升时须按各自 baseline/摘要核实，不根据文件数量推断已包含。

随后最少补 1 项实际 Worker 追加流程和 1 项桌面可信输入浏览器闭环：第一片保存 → 第二笔相离轮廓自动预览 → 确认 → 实际刷新重建两片 → 验证 lastApplied 新 id/current build fingerprint、独立落库旧岸线/高度不变 → 取消下一笔不写根 → 撤销只回退第二片。Worker 场景应确认完整细块流，浏览器应实际看到两片及近景，不以 session 直接调用替代。它们不是当前 6 项 staging 单元通过证据的延伸结论。

已有可复用证据：integration `checks/verification.json` 记录 6/6 首轮通过；共享锁 `v4-lock-staging/checks/first/verification.json` 记录 16/16 首轮通过。两者均为此前 staging 范围，不由本次审查重新执行。具体静态与首轮修复记录仍以其原始 verification/log 为准。

## 仍然不能宣称通过的范围

相离追加不是一般重叠/接壤 union；发生接触时拒绝属于当前合同。粗中心连通数带 `coarse-center-4-neighbor` 标签，不是精确细地表大陆拓扑。公共 dense 输入的首次同步接管热点仍按 `.autopilot/ph06/v4-ingress-audit.md` 单独跟踪：483.73 ms 是细块 validator 的一次 takeSnapshot 测量，既不能说完整 document 上界，也不能说这次局部私有路径优化后 public 250 ms 已达标。取消正确性测试同样不等于 500 ms 延迟已通过。移动仿真、真机、自然大陆视觉及全部 PH 门均不因本报告关闭。
