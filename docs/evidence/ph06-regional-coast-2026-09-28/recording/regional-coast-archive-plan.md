# 沿岸分区形态：证据归档准备

本批归档脚本为 `.autopilot/ph06/prepare-regional-coast-archive.mjs`。**只准备，尚未执行归档**。只有主任务在真实检查、三端流程及视觉审查全部结束后运行它，才会创建 `docs/evidence/ph06-regional-coast-2026-09-28/`。本准备没有改生产、docs、plan、package 或 `.gitattributes`。

## 执行前必须具备

1. `regional-coast-staging/checks/first` 与 `repair-1` 两轮原始终态。首轮失败不能省略，修复轮必须通过。各自 verification 与最终 ready 的哈希绑定一致，sources/identity 前后稳定，日志哈希与原始单元结果一致。脚本不会把 26/28 的首轮写成成功。
2. `regional-coast-checks/first` 已存在；同目录下发现的所有补修轮也必须有终态 verification 和真实退出码。最终轮必须完成计划、lint、类型、单元、构建及 dist 审计，源码稳定、单元范围通过，11 个实际生成器身份及 engine 验证通过。
3. `regional-coast-browser/desktop`、`mobile`、`tablet` 已存在。发现的其他浏览器轮次也必须结束；保存所有轮次原结果，不能删除失败。当前实际构建上必须各有一个桌面、手机、平板通过轮，并引用同一个最终检查轮。要求原始结果中确有一个指定产品流程通过、无重试，维持 450000 ms 与 retries=0。移动和平板是浏览器仿真，不能据此声称真机验收。
4. 真实 `dist/build.json`、最终轮构建和三个通过轮的构建 SHA 一致，版本为实际提升的 preview 21。所有当前 src/tests/scripts/package 配置及 dist 原字节必须与最终检查快照一致；构建 commit 元数据原样保留。preview 20 基线必须仍为 SHA `71c67dd44b5b1c3a8f75ec59cbeeea4e07c96432aa9ad0bc0179403d4999e018`。
5. 已生成的 `src/world/generation/test-fixtures/preview20-coast/SOURCE_MANIFEST.json` 能绑定固定 preview 20 提交、原构建及每个 fixture 字节。原件引用仍可在独立 preview 20 历史包中核验。
6. `.autopilot/ph06/regional-coast-staging/integration-review.md` 已由审查方写完；`.autopilot/ph06/regional-coast-visual-review.json` 已由 root 写完，含 `reviewedByRoot:true`、实际 version/build SHA、三端 `reviewedDevices` 和真实 `reviewedScreenshots`。截图路径使用新归档内的 `browser/<实际轮次>/artifacts/...png`。必须明确给出 `naturalVisualAccepted`、`userVisualAccepted`、`physicalDeviceAccepted`、`performanceAccepted`、`phaseAccepted` 布尔值；**false 可以正常归档，脚本不会替 root 改为 true**。
7. 目标目录不存在，且输入没有符号链接、目录 junction 或越出工程的路径。任何资料缺失、运行未结束、源变化、构建不一致或异常证据体积都会在复制前拒绝。文件复制过程中若发生中断/变化，不会生成成功 verification，也不会自动删除或覆盖残留目录。

## 有限收集范围

- **候选 CPU 两轮**：原 results、logs、verification、sources/identity 前后快照、指纹运行工具；两轮各自的真实 `runtime-sources` 闭包；候选两源、七个实际测试及少量 baseline/config/runner 的原 staged-sources。不会遍历复制整个 staging，也不会复制其 `.vite-cache` 或依赖代理目录。未复制的 staged-sources 条目及原因记录到 references。
- **最终候选与审查**：ready、候选两源、准备/冻结/检查脚本、配置及 integration-review 原件；其后提升脚本、主计划说明和本归档脚本/说明也保存原件。
- **生产统一检查**：仅每个真实检查目录的固定 15 类原始文件，以及根 runner、实际 prior build、integration 记录。首轮失败或后续修复完整保留，不改早期构建 metadata。
- **实际运行源码**：从最终构建的 11 个闭包收集源文件，另含 engine 五源、scope 中的真实单元测试、指纹工具、产品浏览器 spec、包/构建配置和 preview 20 oracle fixture。每个字节都必须匹配最终 source-after；完整 source-before/source-after 哈希快照另行保留，不拿 staging 代理冒充生产源。
- **浏览器三端及其他已完成轮次**：复制原 before/after、build、prerequisite verification、spec/config/runner、run.log、**完整 results.json**、verification 和 `artifacts/` 中的原截图、trace ZIP、视频及附属小型证据文件。不会编辑或裁剪 results；展开 trace/resources 不重复复制。不会递归到旧证据或其他浏览器缓存。
- **独立 preview 20 历史包**：只记录 build、provenance、inventory、存储接线验证及其检查记录的路径/hash，不重复复制整个历史包。

## 输出和保真

所有选中原件以 `COPYFILE_EXCL` 逐字复制，复制前、复制后及收尾再核 SHA256。所有前置条件和选择清单均在第一次目标写入前完成；总数小于 2048、单文件不大于 128 MiB、总原件不大于 512 MiB 是意外巨量诊断数据的拒绝门，**超限必须复核，不能截断 JSON 获取通过**。

目标输出 `files.sha256.json` 包含每件原始源路径、归档路径、字节数和 SHA；`references.json` 列出独立历史包引用和有理由省略的代理/展开 trace；最后写 `verification.json` 绑定清单、实际检查轮、实际构建、三端结果及 root 视觉结论。它只证明归档完整，不增加任何原检查或验收范围。

脚本不调用测试、构建、浏览器、Git 提交或云服务，不写源工程，不创建 `.gitattributes` 规则。主任务如需正式保留该包，须在自己的归档/提交步骤追加对应原始字节规则。
