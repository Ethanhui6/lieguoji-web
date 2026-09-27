# PH07 水文纯内核第一切片证据（2026-09-28）

当前结论：有界纯内核最终 **16/16 单元测试通过，局部类型检查通过**；未接入生产，未完成 PH07-T1，也不是完整河流玩法。此次只读复核关闭了原输入私有复制缺陷，并归档完整失败与修复过程。

| 证据轮次 | 实际结果 | 意义 |
|---|---|---|
| fine-drainage-first | 类型退出 0；14/14 通过 | 原候选通过当时测试，但随后独立审查发现其 slice 可被覆写，不能据此认定私有复制正确。 |
| 独立 9 节点复现 | 原缺陷成功复现 | 普通输入 9 个陆地节点；覆写 slice 并在 capture 回调改源后变为 0，结果数组与源别名。 |
| intrinsic-private-copy-fix | 类型退出 0；16/16 通过 | 保留原 14 项，新增覆写 slice 与子类 iterator/species 两项回归；不是累计 30 个独立测试。 |

修复实际使用一次捕获的两个源数组引用，先校验原范围/内存合同，再创建普通固定长度 Int16Array，以捕获的 intrinsic set 复制。新增回归要求首次 capture 改源不改变计算结果、输出 buffer 独立，且不调用源 slice/iterator/species。只读复核核对了实际源差异、原始断言报告与前后来源 SHA，没有再次运行测试。

内核范围是既有 2-world 细节点的 2..512 × 2..512 矩形，最多 262144 节点；支持确定性下降和平坡无环流向、按样本数汇集、裁剪不确定传播、真实海岸终点与局部鞍口候选。内存上界保持 48 字节/节点，操作门保持 64N+1024。测试中的中等规模检查不等于整世界性能验收。

实际湖水体积、湖盆合并、跨片汇流、流量驱动河线、生产快照适配、Worker/UI/存档均未接入；NO_WATER 不是湖面，sample counts 不是降雨或流量。原 PH06 与后续阶段门未改变。

归档复制 **50 个原文件、362593 字节**，保留两轮源快照、首轮旧 ready/README、两轮原日志/报告/来源 hash、最终源与配置，以及独立原缺陷证据。全部副本逐字节核对 SHA。额外生成独立关闭说明、文件清单和汇总 verification；不覆盖既有不同内容。原日志按原名保留，未修改 Git 忽略或提交白名单。

- [汇总 verification](ph07-hydrology-kernel-2026-09-28/verification.json)
- [逐文件 SHA 清单](ph07-hydrology-kernel-2026-09-28/files.sha256.json)
- [最终源与 ready](ph07-hydrology-kernel-2026-09-28/source/ready-manifest.json)
- [首轮 14 项原记录](ph07-hydrology-kernel-2026-09-28/checks/fine-drainage-first/verification.json)
- [原 9 节点失败事实](ph07-hydrology-kernel-2026-09-28/review/original/private-copy-probe.json)
- [修复后 16 项原记录](ph07-hydrology-kernel-2026-09-28/checks/intrinsic-private-copy-fix/verification.json)
- [独立缺陷关闭说明](ph07-hydrology-kernel-2026-09-28/review/PRIVATE_COPY_CLOSURE.md)

| 对象 | SHA-256 |
|---|---|
| 原内核 | 4be70639685b22e53f3d4b95d8785e75d59122501a377397cfa5f8839e2d1671 |
| 修复内核 | e7f12a9fb46c6f6a456e0f46ab073c6cffe0d62541056bd97bc3ed4e30cb1742 |
| 最终测试 | 2f6b7530d11cbede9fe68aa194c794b9e61b23557d1a7b63a1dd6dfe49380cb0 |
| 最终 ready | d6e742cf8b07f556b1a0f72b3627942711902a86e86925b2542bf77d253b78bd |
| 文件清单 | cdf3a7fbbc79221b8e822767c0e921997e47613abd27a9c7d9a23f7e584eb5ae |

归档操作只写本证据目录、本文及忽略的归档脚本，没有修改生产 src/tests、plan、handoff、dist，也未运行构建、浏览器或宽测试。
