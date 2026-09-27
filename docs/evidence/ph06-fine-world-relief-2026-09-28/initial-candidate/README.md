# 自然大陆细高程山系候选（未接入）

本目录仅有隔离候选与数值证据。生产 `src`、`tests`、`scripts`、`package`、`dist` 未修改，没有 Vite 构建、GPU／浏览器运行、上传或发布。`verification.json` 明确保留 integrated / visualAccepted / terrainPersistenceVerifiedForCandidate = false。

## 可提升文件与显式开关

- `src/world/generation/detail-natural-relief.ts` → 同名生产文件。
- `src/world/generation/detail-orography.ts` → 同名生产文件。
- `fine-world-relief.test.ts` 是候选隔离测试；提升时需要改为正式测试位置，并把 baseline 对照替换为已冻结的真实旧生成闭包，不能把当前生产代码当永久旧基线。

入口为 `createNaturalRelief({ ..., heightPlanning: 'fine-world' })`。只有显式设置才采用细高程山体规划；未设置的 world 保留原算法，local 也保留原算法，并拒绝 local 与该开关混用。Orography helper 的 `crossSection: 'fine-world'` 只由此入口设置，要求采样间距恰为 512 Q8 = 2 world。默认未设时保留原截面与 16-world Hbase 兼容测试。

**接线位置（尚未修改）：**

1. `src/world/generation/detail-shape-natural.ts:287` 的 `createNaturalRelief` 私有调用增加 `heightPlanning: 'fine-world'`。该函数对新正陆地真实写入每个 2-world fine-node 的现有循环从约 300 行开始；不要再改回 Hbase 插值，不改海岸距离或存档格式。
2. 第一片自然大陆通过 `detail-shape-natural-adapter.ts:44` 调用上述函数；追加自然大陆通过 `detail-shape-natural-add.ts:154` 同样调用它生成新的独立组件。上述一个调用点接线会同时改变 `shape-detail-landmass-v2` 和 `add-detail-landmass-v2` 当前生成闭包，**不需要在配方或存档里偷偷加入字段**。
3. `detail-local-relief.ts:252–253` 继续 `scaleMode: 'local'`，不设置 `heightPlanning`。局部编辑的数值行为没有改变。
4. 两个共享模块变化仍会改变自然、追加和 local 的源码闭包指纹，即使 local 数值等价，也不得冒充旧指纹；由根流程先冻结实际 preview18/19 闭包，再纳入真实新构建元数据与历史规则。旧 Hbase 读取器、旧存档与海岸算法没有修改。

## 具体改变

以前世界模式按 32 / 16 / 8 world 的粗模拟间距决定最小主宽、分支宽、脊采样间距与低地起伏间距；大大陆通常先被短轴 45%、最大 256 world 的宽肩主导，Orography 再把宽山带的脊宽比例增至 46%、山肩高度份额增至 42%。所以单改最小宽度不够。

显式 fine-world 保持世界模式的九个主锚点、最多两个各四锚点且共享根点的分支、实际陆地曲线探针与沿弧长的主峰／鞍部规划，调整如下：

- 固定实际采样规划为 2 world，主宽下限 24、分支宽下限 16、内陆筛选距离 48、允许分支所需短轴 192、低地起伏尺度 32 world。粗网格仍负责锚点候选的位置采样，因此不会声称跨分辨率坐标完全相同。
- 主肩宽取短轴 25%、主锚点间距 65%、160 world 上限中的较小值，再保留既有种子宽度变化；不改变主支世界布局的语义，也没有把 world 直接改成 local。
- 细截面的低山肩份额为 18%，脊截面以肩宽约 17% 为基准，固定 6 world 下限与 40 world 上限；用既有连续种子噪声在 64-world 沿弧长尺度上轻微改变实际脊宽。它改变 `physicalHeight` 返回的真实高程，未加入装饰 shader、纹理、后处理或移动山系中心线。
- 保持有限节点、桶候选、曲线探针和引用预算；保持同一取消检查点、陆地检查、非负山系合成、支脊实际父高程连接和海岸坡度门控。

## 本轮有限证据

`guard-final-tests.json`：**22/22 PASS**（6 个新候选测试 + 16 个现有 Orography 测试，显式隔离解析到候选模块），类型检查、定向 lint PASS。`verification.json` 记录实际退出码、用时、文件前后 SHA 与生产两模块未改变。没有扩大超时或删除断言；数值用例总运行约 0.8 秒，命令总计约 1.8 秒。

控制样本是同一 seed=9811 的同一椭圆陆地，用于隔离粗模拟分辨率影响，**不是地理外观样板**。原始截面 241 个 2-world 样本、真实曲线点和尺寸在 `measurements.json`。

| 粗网格 | 高峰处实测半高带宽 world | 峰高 m | 最大单桶候选 | 支持节点 | 真陆地探针 |
| --- | ---: | ---: | ---: | ---: | ---: |
| 128 | 24 | 2110 | 82 | 729 | 5592 |
| 256 | 24 | 2109 | 82 | 726 | 5542 |
| 512 | 24 | 2110 | 81 | 725 | 5547 |

旧 128 样本的半高带宽为 88 world、峰高 2111 m；新样本 24 world、2110 m。峰值未靠缩矮山体取得细窄效果。跨分辨率山肩最大宽约 162.74–162.85 world，包含侧坡宽度修正；不是把内部 160-world 名义上限伪称为完整外包络。

测试还覆盖：实际高程在原单一粗格内变化；峰间曲线高程连续为正；主支根点相同且支脊低于实际父高程；逐曲线点在陆地；12-world 海峡切断被拒绝；海岸零高程、海侧逐点与基线一致；局部与未设开关世界逐点／曲线／摘要等价；在真实陆地探针计数达到 64 后取消；拒绝 fine-world helper 被误接 32-world 采样。

**首轮失败保留：** `first-tests.json` 为 20/21，五个新候选用例通过，原世界／局部比例兼容用例失败；首轮把默认 world 直接改成细规划，破坏该兼容契约。`first-source/` 保留当时两模块、测试、解析配置及准备脚本。改为显式开关后 `flag-repair-tests.json` 为 22/22。后续加入可复核测量输出及 helper 错误采样防护，最终 `guard-final-tests.json` 为 22/22；不能把这些重复轮次累加成新测试数量。

## 未通过／未声称

- 还没有把候选通过真实用户轮廓写入 IndexedDB、刷新、撤销、追加旧地图、锁区校验或 Worker 取消完整链；这些在提升后仍需针对新闭包验证。
- 还没有候选的游戏远景／近景或手机截图，不能断言“看起来已经自然”。沿主轴的 S 弯布局仍然是旧锚点策略；本候选主要解决软帽状宽脊，不能替代更完整的侵蚀、水系、复杂地质结构。
- 单一受控形状跨三分辨率不是全世界／多种子性能验收。所有预算原值保留，极端形状仍可按既有预算显式拒绝。
- 没有加入国家、行政区、城市、兵种和战斗。所有 PH 完成度保持根流程的真实状态。

复核：`node .autopilot/ph06/fine-world-relief-staging/check.mjs`。此脚本只检查隔离候选，会先校验当前生产两模块与冻结 baseline 相同，变化时拒绝继续。不要在生产提升后重跑该脚本并误把当前源码重新冻结成旧基线。
