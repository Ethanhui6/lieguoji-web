# Preview15 实际生成器历史冻结候选

仅 staging 捕获及兼容候选。未提升、未跑测试/build/browser、未修改生产/docs/tests/dist。

实际 `0.5.0-preview.15` 构建 SHA 为 `ca7fe62d32063f080795512b60f9f91a01baf49852c4fb1239d368488f91052e`。真实 HEAD/构建 base 为 `69723a80b89fb15cd0ed4c1ea5037fa0bdd61446`，当前源含未提交的非对称海岸、细噪声投影取样修复和历史注册表等；`sourceIsHead=false`、`closureSourceMatchesHead=false`。

实际冻结 **11 个生成器闭包、41 份原始源码**，从当前源和冻结原件分别重算，文件列表和指纹逐项匹配实际 build。source snapshot SHA 为 `7638c56685187af98c3c8a1472cc289761b3205d7c1f2c493ff83e7267b0e6e1`。原件归档共 **55 文件**，inventory 列出其余 54 项。

证据使用 `.autopilot/ph06/asymmetric-coast-checks/shore-projection-fix/` 的真实 `verification.json` 与 `identity-verification.json`，不是旧 identity-reconciliation 格式。根 10 文件52/52、全局六检查、25产物均为已完成的局部技术证据，本次捕获只读取验证，不重跑。独立重算得出9项 history-only、2项 non-history-runtime-change；不预设变化数量。

首轮51/52失败的 `verification.json` 和 `unit.json` 原件保存在 `first-failed/`，没有抹掉或改成通过。最新52/52原始报告、身份报告及源码前后清单一并冻结。**preview15 浏览器未运行，自然视觉未通过**；不能把这一版本的局部技术 PASS 当作三端、用户、PH、真机或性能验收。

目标归档 `docs/evidence/ph06-preview15-generator-history-2026-09-28/`。root 应核对 ready 基线和全部原字节，先归档并保护字节，再提升 `generation-history.ts` 镜像及 `detail-preview15-history.test.ts`。后续修改湾岬尺度需要自己的真实新构建和检查，不改写本批原件。

兼容测试 **5项已写未执行**，覆盖全部实际闭包/字节、新身份报告与旧首轮失败、11种历史配方存储往返和禁执行、命名空间隔离、伪造/未来参数拒绝及有界v4局部山地语义。测试依赖原preview14冻结源和本preview15归档。历史表仅允许原样读回，不能执行旧配方或静默迁移。
