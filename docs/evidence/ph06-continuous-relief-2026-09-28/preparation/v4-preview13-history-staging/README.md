# Preview13 生成器历史冻结候选

仅 staging 准备，未修改或提升生产文件，未运行测试、lint、构建、浏览器或生成世界。完整 PH、自然视觉、真机和性能均未因此验收。

## 实际捕获

- `capture-actual.mjs` 已执行。实际 `dist/build.json` 为 `0.5.0-preview.13`，SHA-256 `bca77550682140eb8386b9dcee02bcb198885425cc4b5d0f63e6c0ac30e93b0d`。
- 捕获时实际 HEAD 与构建元数据均为 `0a02f3c27ce2acafec014e4f89d2693416243105`。整个产品不是该提交的原样构建：区域保护 UI、私有快照、测试和版本号仍有未提交修改。`sourceIsHead=false`。
- 全部 **11 个**生成器运行闭包按当前真实工具重算，再从冻结原件独立读回重算；每项文件列表及 SHA 均匹配实际构建。闭包并集实际为 **39 份源码**，全部与 HEAD 原始字节相同；没有沿用旧模板的 10/37 计数。
- 11 个生成器和引擎身份逐项等于已归档的真实 preview12 构建。其 `build.json` 原件也被保存，未依赖口头结论。新闭包包括 `detail-local-relief.ts` 和 `local-detail-relief-adapter.ts`。
- 25 份 `dist` 文件当前逐项匹配根 `lock-snapshot-checks/first/verification.json`。这里只保存哈希清单，不复制发布产物。根检查结果为已有证据引用，不声称本候选再次运行了这些检查。
- 首次捕获在发现 `tests/atlas-detail-lock-relief.spec.ts` 于原构建检查后变化时主动停止，尚未写入 evidence。随后将运行产品与非运行测试源码分开核对：所有运行源码仍匹配，唯一变化的测试源码单独冻结在 `post-build-check-source/`，同时保留旧 SHA、新 SHA 和原检查前后清单。**当前测试脚本不是 first 检查时的字节**。

冻结目录 `evidence/preview13/` 共 **49 文件**，`inventory.json` 记录其余 48 项。`provenance.json` 给出完整实际数量、原件字节 SHA、产品 Git 状态、构建源身份区别和重算结果。source snapshot SHA 为 `50e3d56be35f5c6ff00f79d59c144cf31662d8e62a2403a6e9710c2226b24948`。

## 待主执行者提升

1. 核对 `ready-manifest.json`、两份目标文件当前基线及全部原始字节。保留已有变更。
2. 将 `evidence/preview13/` 原样复制至 `docs/evidence/ph06-preview13-generator-history-2026-09-28/`；为此目录保留原字节规则，禁止覆盖同名既有归档。
3. 提升 `src/world/generation-history.ts` 镜像和新 `src/world/detail-preview13-history.test.ts`。顺序上必须先归档，测试才有真实输入。
4. 后续当前源码闭包将因历史表改变而产生新指纹；这些实际 preview13 身份只用于旧存档验证，**不能执行历史配方**。保留 v1、natural `id@2` 和 `local-detail-relief` 各命名空间隔离。
5. 在主批次统一检查。5 个窄回归已写未执行：真实冻结字节/全闭包、11 种历史配方编码往返及禁止执行、命名空间隔离、伪造/未来/额外字段拒绝、局部山地旧版本与有界 scope 拒绝。

最初的 `capture.mjs`、`record-ready.mjs` 是未执行且不适用的旧模板，保留以便审计，**不要运行**。最初三个文件原字节另存在 `initial-candidate/`；实际入口是 `capture-actual.mjs` 和 `record-ready-actual.mjs`。捕获入口拒绝覆盖已有冻结目录，不能重复运行覆盖原件。
