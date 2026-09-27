# Preview14 生成器历史冻结候选

仅在 staging 准备，未提升生产、未修改 docs/tests/dist，未运行测试、lint、构建、浏览器或生成世界。执行过的捕获是源码指纹和原件归档，不是游戏验收。

- 实际版本 `0.5.0-preview.14`，build SHA-256 为 `702726d6fa956e2f647ff2fe91d9f136479aeef3888acc151c30bd0e95712075`。
- 捕获时 HEAD 与 build 元数据均为 `a8eec28c85a012f7194c727b746c31db354b9f0f`，但整个产品和生成器都含未提交代码。`sourceIsHead=false`、`closureSourceMatchesHead=false`。不能把这个 HEAD 当作完整源码身份。
- 真实闭包并集为 **41 份原始源码**，覆盖全部 **11 个生成器**。两份新增 helper `detail-curved-ridge.ts` 与 `detail-local-background.ts` 已在实际依赖图和冻结原件中，不沿用上一批 39 数量。
- 实际源码重算、冻结原件读回重算，均逐项匹配 build 的 SHA 和文件列表。与 HEAD 不同的 5 份闭包源码为历史注册表、自然地形、局部地形、曲脊 helper、局部背景 helper。
- 对真实 preview13 原件再次独立重算：8 项闭包仅因历史注册表依赖变化，3 项还有地形实现变化；引擎不变。没有把所有闭包变化都说成算法变化。
- 实际根 `type-guard-fix` 的六条命令成功，但原始 `passed=false` 被完整保留。其独立身份校正收据精确绑定原结果、源快照和 build；捕获脚本又重算核对了该分类。本候选没有重跑这些检查，也不引用浏览器结果作为冻结前提。
- 当前产品源码和 25 个 dist 文件仍精确匹配实际检查快照。这里只复制 build 元数据和生成器原件，不复制 dist 发布负载或真实存档。

`evidence/preview14/` 共 **53 文件**；inventory 记录其余 52 项。源快照 SHA 为 `a26b138d457beb331568ca7e5bd9f15a69e34414901ccacc2d1652ddd32e2027`。`provenance.json` 保留原始字节 SHA、真实数量、HEAD 差异、校正收据身份和原失败标记。

待 root 检查 `ready-manifest.json` 后先原样归档到 `docs/evidence/ph06-preview14-generator-history-2026-09-28/`，为原件使用字节保护规则，再提升 `src/world/generation-history.ts` 镜像及新 `src/world/detail-preview14-history.test.ts`。不得覆盖已存在的同名归档，候选基线变化时先重新判断，不能强行覆盖。

新测试 **5 项已写、未执行**：所有实际冻结闭包与原件及 8/3 分类、11 种历史配方存储往返与拒绝旧代码执行、命名空间隔离、伪造/未来/额外参数拒绝、局部山地 v4 和有界 scope 约束。测试需要已有 preview13 原件归档与本批 preview14 原件都存在。

历史登记只能允许旧存档原样校验；不能执行旧配方、冒造当前指纹或静默迁移。后续海岸改形仍需自己的真实代码、闭包、检查与视觉证据。PH、自然视觉、真机、性能和云端验收均不因本候选而通过。
