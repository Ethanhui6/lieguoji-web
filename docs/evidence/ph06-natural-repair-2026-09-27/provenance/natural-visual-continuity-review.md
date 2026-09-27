# 山脊端点延长线连续性修复复核

结论：**此次修补消除了首轮审阅指出的侧宽硬切换与端点延长线有限高度跳变。该项阻断可关闭；相关函数与新增回归未发现新的确定阻断。** 这不是整个自然视觉、实际浏览器、真机或性能验收结论。

本次仅只读检查相关函数、新增回归和已有原始结果，另写此报告；没有执行任何测试或构建，没有修改生产、候选或首轮 `natural-visual-repair-review.md`。

## 绑定来源

下列 SHA 来自本次对实际候选文件的读取，不只引用 ready 声明。相对首轮审阅，前两个内核 SHA 不变，只有 relief 内核修复。

| 候选文件（均位于 `.autopilot/ph06/v4-natural-visual-repair-staging/`） | 当前 SHA-256 |
| --- | --- |
| `src/world/generation/detail-shape-natural.ts` | `7b07ebfd01ba47027eafa2f6cb20eec73a9c4e23351ab53a85c63c8459da8bf8` |
| `src/world/generation/detail-natural-outline.ts` | `0428a0463f0775c20aca00d0224edc2c1f534256de137ae2f0dd8d097a8611db` |
| `src/world/generation/detail-natural-relief.ts` | `bef73352fa8920a7a2aeb496dd3533af4b936be68c7db10cc2172aa9b3d55175` |
| `src/world/generation/detail-natural-visual-repair.test.ts` | `6343e307bf4ffc0e87ee53aaf062f35323f375631660c85c46617c4dd6717086` |

## 修补消除原缺陷的原因

`detail-natural-relief.ts:24–43` 不再依赖 `Math.sign(cross)` 选择两种宽度。它将叉积除以段长得到有符号垂距，并在正过渡宽度 `D = max(stepQ, W/4)` 中形成有界侧向比例。忽略原有整数取整时，等价关系为：

`lean = clamp(perpendicular / D, -1, 1)`

`effectiveWidth = W × (1 + (614/4096) × lee × lean)`

`W` 仍由两锚点宽度按平滑的钳制投影参数插值得到。对实际生成的非退化山脊，`D > 0`；跨过端点延长线时，垂距从负值经零变为正值，`lean` 同样经过零，有效宽度从两侧趋近同一 `W`。即使投影被钳到端点且距离 `d > 0`、端点峰值 `P > 0`，两侧贡献现在仍趋近同一 `P × (1-d/W)²`，原来直接跳到约 `0.85W/1.15W` 的分支已经消失。

参数钳制与 `smoothQ` 不重新引入符号分支；支撑边界 `d = effectiveWidth` 上的贡献趋近零，与返回零分支相接。原整数 Q8/Q12 与米高程仍有固有取整台阶，不能把实现宣称为严格实数连续；关闭的是原报告中远大于取整的有限硬切跳变。尖脊的左右斜率不必相等，也不在此要求 C1 连续。

宽度系数仍位于 `[3482/4096, 4710/4096]`，没有提高原最大范围、峰值、锚点数、资源预算或创建新地形层。`physicalHeight` 的真实生成路径在 `140` 行调用同一个 `naturalRidgeContribution`；回归测试的函数不是与产品脱离的测试替身。

## 回归与已有证据

新增回归位于候选测试 `62–68` 行：设置两端峰值均为 4096、宽度 128 world 的有限段，在两端外各 40 world 的延长线上，比较横向 `-1/+1 Q8` 的实际贡献，差值阈值维持 **2 Q12**。这正好覆盖“非零端点、投影已钳制、距离非零”的原触发条件。另在中段比较两侧 64 world 位置，要求贡献差仍大于 100，防止通过删去侧向差异来掩盖问题。

本次实际阅读了以下保留证据，没有重新执行：

- `checks/continuity-first/unit.log`：原实现真实失败，断言收到 **534** 而阈值为 **2**；该轮 1 个失败、4 个未选中，不能记为通过。
- `checks/continuity-repair/verification.json`：既有完整窄轮 **15/15**、0 失败、0 pending、0 retry；unit 退出 0、耗时 21102.6828 ms；typecheck 与 lint 均退出 0，`sourceUnchanged: true`。这里的耗时只是已存执行记录，非性能验收。

首轮缺陷报告及失败日志应继续保留。前轮对原始自交/接触、2Q 简化、12 world 对岸 cap、幅度与 @1 隔离的只读结论没有因本次修补扩大范围。实际产品渲染、更多地图/seed 和用户自然视觉验收仍由后续协调流程判断。
