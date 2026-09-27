# Preview 21 原生成器兼容基线

**实际捕获与冻结副本复核已通过，待后续历史兼容接线。** 主任务完成三端、正式沿岸分区证据归档及游戏提交后，明确提供 `31e27620c816db33993a8ac419274c9a86c32624`；本次只从该 Git 提交提取原件，没有猜测或替换游戏提交。捕获开始和结束时 HEAD 均为该 SHA，工作区干净。

固定已知实际身份：`0.5.0-preview.21`；原 build SHA256 `639ca2288c4d4ca0d3e8f21762c06be8e49678045c45c8dadfc91ec2314d7761`；原 `build.commit` 为 `502164889fef2f0280b725c76538cd07df7d5e36`，不得改写。

捕获入口为 `capture.mjs <actual-preview21-game-commit-full-sha>`，复核入口为 `verify.mjs <同一完整提交 SHA>`。两个入口均要求显式 40 位 SHA，不默认 HEAD；capture 还要求该提交是捕获开始时 HEAD、包版本为 preview 21，并已包含 `docs/evidence/ph06-regional-coast-2026-09-28/` 正式归档。从 Git 对象读取，不使用未来工作区/新的 dist 冒充原件。

脚本会核验已归档的 `unified/first` 六项检查和 149/149 单元结果（24 文件）、完整 source-before/after 与 identity 绑定；用提交内原工具重算 11 个闭包及 engine，并要求 42+5 个原始源码字节与 source-after 完全一致。原构建、prior/pre-run metadata、原视觉结论全部保持。正式归档清单 SHA 从该明确提交的原件读取并与其 verification 相互绑定，不猜未来清单值。

必须有 desktop/mobile/tablet 三个实际通过终态，均使用同一原构建和 first 检查轮。只复制少量终态 JSON、原候选 first 26/28 失败及 repair-1 28/28 结果；截图、trace、完整早期候选源码继续引用正式归档，不重复复制。生产 first 149/149 通过与早期隔离候选失败分别记录。

本次已实际运行 capture 和 verify，仅进行字节、归档绑定及源闭包哈希检查。11 个生成器闭包、42 个生成器源文件及 5 个 engine 源文件全部吻合；47 个原件与正式 `unified/first/source-after.json` 原始字节完全相同，0 个换行例外。冻结副本重算同样通过。

- 冻结证据：78 个文件。
- 本包 inventory SHA256：`2263e70dcb87e53b137af91674e6a75a2e8e2a5f3a1caa68f47c8de219539a7f`。
- 本包源码记录摘要：`6c8408fe118a152b03511b05ec49c0d3ae67fffb29d0cbef47a7b1f39be09f06`。
- 原正式归档 inventory SHA256：`c2190be2d578c475cfec51e8bc14e0cee2a6cf6eed792df946fafcd266691950`。

原技术结果为 149/149；原桌面、手机、平板流程分别通过，耗时 181979.4326、200809.4269、293587.8354 ms。本次没有重跑这些产品检查。自然观感、用户视觉、真机、性能及整 PH 验收仍按原件保持 false。

`self-check.json` 与 `ready-manifest.json` 是本次冻结交接记录。脚本拒绝覆盖已有 evidence。本次没有运行生成器、产品测试、构建、浏览器、历史接线、Git 提交或云端写入，也没有修改其他 staging 或生产文件。
